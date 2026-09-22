/**
 * PCALC Section & Beam Module (pcalc_section.js)
 * Multi-norma Section Design & Verification (NBR 6118 • ACI 318-22 • Eurocode 2)
 * Combined Flexure + Axial Force (M-N) + Shear (V) + M-N Capacity Envelope
 */

const pcalcSection = (function () {
    let activeRebarMode = 'beam';
    let customBars = [
        { x: 4.0, y: 4.0, diametro: 16.0 },
        { x: 10.0, y: 4.0, diametro: 16.0 },
        { x: 16.0, y: 4.0, diametro: 16.0 },
        { x: 4.0, y: 46.0, diametro: 10.0 },
        { x: 16.0, y: 46.0, diametro: 10.0 }
    ];

    const PRESETS = {
        convencional: { bw: 20, h: 50, c: 3.0, fck: 30, fyk: 500, Msd: 100, Nsd: 0, Vsd: 60, num_barras: 4, diam_barra: 16.0, num_barras_top: 2, diam_barra_top: 10.0, diam_estribo: 8.0, pernas_estribo: 2, s_estribo: 15 },
        baldrame: { bw: 25, h: 60, c: 4.0, fck: 30, fyk: 500, Msd: 140, Nsd: -250, Vsd: 85, num_barras: 5, diam_barra: 16.0, num_barras_top: 3, diam_barra_top: 12.5, diam_estribo: 8.0, pernas_estribo: 2, s_estribo: 12 },
        tirante: { bw: 25, h: 50, c: 3.5, fck: 35, fyk: 500, Msd: 70, Nsd: 150, Vsd: 45, num_barras: 6, diam_barra: 16.0, num_barras_top: 2, diam_barra_top: 10.0, diam_estribo: 8.0, pernas_estribo: 2, s_estribo: 15 },
        transicao: { bw: 35, h: 90, c: 4.0, fck: 40, fyk: 500, Msd: 420, Nsd: -500, Vsd: 220, num_barras: 6, diam_barra: 25.0, num_barras_top: 4, diam_barra_top: 16.0, diam_estribo: 10.0, pernas_estribo: 4, s_estribo: 12 },
        dupla_armadura: { bw: 20, h: 45, c: 3.0, fck: 25, fyk: 500, Msd: 160, Nsd: 0, Vsd: 70, num_barras: 4, diam_barra: 20.0, num_barras_top: 3, diam_barra_top: 16.0, diam_estribo: 8.0, pernas_estribo: 2, s_estribo: 15 }
    };

    function round(val, dec = 2) {
        return Math.round(val * Math.pow(10, dec)) / Math.pow(10, dec);
    }

    function switchRebarMode(mode) {
        activeRebarMode = mode;
        const btnBeam = document.getElementById('tab-btn-beam');
        const btnBars = document.getElementById('tab-btn-bars');
        const viewBeam = document.getElementById('rebar-mode-beam');
        const viewBars = document.getElementById('rebar-mode-bars');

        if (mode === 'beam') {
            if (btnBeam) btnBeam.className = "rebar-tab-btn active px-2.5 py-1 rounded-md font-semibold transition-all";
            if (btnBars) btnBars.className = "rebar-tab-btn px-2.5 py-1 rounded-md font-semibold text-gray-600 dark:text-gray-300 hover:text-white transition-all";
            if (viewBeam) viewBeam.classList.remove('hidden');
            if (viewBars) viewBars.classList.add('hidden');
        } else {
            if (btnBeam) btnBeam.className = "rebar-tab-btn px-2.5 py-1 rounded-md font-semibold text-gray-600 dark:text-gray-300 hover:text-white transition-all";
            if (btnBars) btnBars.className = "rebar-tab-btn active px-2.5 py-1 rounded-md font-semibold transition-all";
            if (viewBeam) viewBeam.classList.add('hidden');
            if (viewBars) viewBars.classList.remove('hidden');
            renderBarsTable();
        }
        calculate();
    }

    function generateRebarPattern() {
        const bw = parseFloat(document.getElementById('bw')?.value || 20);
        const h = parseFloat(document.getElementById('h')?.value || 50);
        const c = parseFloat(document.getElementById('c')?.value || 3);
        const phiEst = parseFloat(document.getElementById('diam_estribo')?.value || 8) / 10;
        const nBot = parseInt(document.getElementById('num_barras')?.value || 4);
        const dBot = parseFloat(document.getElementById('diam_barra')?.value || 16);
        const nTop = parseInt(document.getElementById('num_barras_top')?.value || 2);
        const dTop = parseFloat(document.getElementById('diam_barra_top')?.value || 10);

        customBars = [];
        const effX1 = c + phiEst + (dBot / 20);
        const effX2 = bw - c - phiEst - (dBot / 20);
        const effYBot = c + phiEst + (dBot / 20);
        const effYTop = h - c - phiEst - (dTop / 20);

        for (let i = 0; i < nBot; i++) {
            const x = nBot > 1 ? effX1 + i * (effX2 - effX1) / (nBot - 1) : bw / 2;
            customBars.push({ x: round(x, 1), y: round(effYBot, 1), diametro: dBot });
        }
        for (let i = 0; i < nTop; i++) {
            const x = nTop > 1 ? effX1 + i * (effX2 - effX1) / (nTop - 1) : bw / 2;
            customBars.push({ x: round(x, 1), y: round(effYTop, 1), diametro: dTop });
        }
        renderBarsTable();
        calculate();
    }

    function renderBarsTable() {
        const tbody = document.getElementById('bars-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        customBars.forEach((bar, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700/50';
            tr.innerHTML = `
                <td class="px-2 py-1"><input type="number" step="0.5" value="${bar.x}" onchange="pcalcSection.updateBarProp(${idx}, 'x', this.value)" class="w-16 p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600"></td>
                <td class="px-2 py-1"><input type="number" step="0.5" value="${bar.y}" onchange="pcalcSection.updateBarProp(${idx}, 'y', this.value)" class="w-16 p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600"></td>
                <td class="px-2 py-1">
                    <select onchange="pcalcSection.updateBarProp(${idx}, 'diametro', this.value)" class="p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600">
                        ${[6.3, 8.0, 10.0, 12.5, 16.0, 20.0, 25.0, 32.0].map(d => `<option value="${d}" ${d === bar.diametro ? 'selected' : ''}>${d} mm</option>`).join('')}
                    </select>
                </td>
                <td class="px-2 py-1 text-center">
                    <button type="button" onclick="pcalcSection.removeBar(${idx})" class="text-red-500 hover:text-red-700 text-xs font-bold">&times;</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updateBarProp(idx, prop, val) {
        if (customBars[idx]) {
            customBars[idx][prop] = parseFloat(val);
            calculate();
        }
    }

    function addRebarRow() {
        const bw = parseFloat(document.getElementById('bw')?.value || 20);
        const h = parseFloat(document.getElementById('h')?.value || 50);
        customBars.push({ x: round(bw / 2, 1), y: round(h / 2, 1), diametro: 16.0 });
        renderBarsTable();
        calculate();
    }

    function removeBar(idx) {
        customBars.splice(idx, 1);
        renderBarsTable();
        calculate();
    }

    function updateRebarPreviews() {
        const getNum = (id, def = 0) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) || def : def;
        };

        const bw = getNum('bw', 20);
        const h = getNum('h', 50);
        const c = getNum('c', 3.0);
        const fck = getNum('fck', 30);
        const fyk = getNum('fyk', 500);
        const Msd = getNum('Msd', 100);
        const Nsd = getNum('Nsd', 0);
        const Vsd = getNum('Vsd', 60);

        const numBot = getNum('num_barras', 4);
        const phiBot = getNum('diam_barra', 16);
        const asBot = numBot * (Math.PI * Math.pow(phiBot / 10, 2) / 4);

        const numTop = getNum('num_barras_top', 2);
        const phiTop = getNum('diam_barra_top', 10);
        const asTop = numTop * (Math.PI * Math.pow(phiTop / 10, 2) / 4);

        const phiEst = getNum('diam_estribo', 8.0);
        const pernas = getNum('pernas_estribo', 2);
        const s = getNum('s_estribo', 15);
        const asw = pernas * (Math.PI * Math.pow(phiEst / 10, 2) / 4);
        const aswM = s > 0 ? (asw / s) * 100 : 0;

        const d = Math.max(5, h - c - (phiEst / 10) - (phiBot / 20));
        const Ac = bw * h;
        const fcd = fck / 1.4;
        const fyd = fyk / 1.15;

        // Reduced moment mu and normal nu
        const mu = (Msd * 100) / (bw * Math.pow(d, 2) * (fcd / 10));
        const nu = (Nsd) / (Ac * (fcd / 10));

        // 1. Badges
        const geoBadge = document.getElementById('sec-geo-badge');
        if (geoBadge) geoBadge.textContent = `${bw} × ${h} cm • C${fck}`;
        const loadsBadge = document.getElementById('sec-loads-badge');
        if (loadsBadge) loadsBadge.textContent = `MSd = ${Msd} kNm | NSd = ${Nsd} kN`;
        const rebarBadge = document.getElementById('sec-rebar-badge');
        if (rebarBadge) rebarBadge.textContent = `As = ${asBot.toFixed(2)} cm²`;

        // 2. Metric Strips
        const acPrev = document.getElementById('sec-ac-preview');
        if (acPrev) acPrev.textContent = `Ac = ${Math.round(Ac)} cm² | d ≈ ${d.toFixed(1)} cm`;
        const matPrev = document.getElementById('sec-mat-preview');
        if (matPrev) matPrev.textContent = `fcd=${fcd.toFixed(1)} MPa | fyd=${fyd.toFixed(1)} MPa`;

        const muPrev = document.getElementById('sec-mu-preview');
        if (muPrev) {
            const domain = mu <= 0.295 ? 'Domínio 2/3 (Arm. Simples)' : 'Domínio 4 (Requer Arm. Dupla)';
            const col = mu <= 0.295 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400';
            muPrev.className = `font-mono font-bold ${col}`;
            muPrev.textContent = `μ = ${mu.toFixed(3)} • ${domain}`;
        }
        const nuPrev = document.getElementById('sec-nu-preview');
        if (nuPrev) {
            const solDesc = Nsd < 0 ? `Compressão (ν=${nu.toFixed(2)})` : (Nsd > 0 ? `Tração (ν=${nu.toFixed(2)})` : 'Flexão Simples (N=0)');
            nuPrev.textContent = `ν = ${nu.toFixed(3)} (${solDesc})`;
        }

        const asLive = document.getElementById('sec-as-live-preview');
        if (asLive) asLive.textContent = `As = ${asBot.toFixed(2)} cm² | As' = ${asTop.toFixed(2)} cm²`;
        const shearLive = document.getElementById('sec-shear-live-preview');
        if (shearLive) shearLive.textContent = `Asw/s = ${aswM.toFixed(2)} cm²/m (${pernas}R Φ${phiEst} c/${s}cm)`;

        // In-line previews
        const asPreview = document.getElementById('as-preview');
        if (asPreview) asPreview.textContent = `As = ${asBot.toFixed(2)} cm²`;
        const asTopPreview = document.getElementById('as-top-preview');
        if (asTopPreview) asTopPreview.textContent = `As' = ${asTop.toFixed(2)} cm²`;
        const aswPreview = document.getElementById('asw-preview');
        if (aswPreview) aswPreview.textContent = `Asw/s = ${aswM.toFixed(2)} cm²/m`;
    }

    function loadPreset(presetKey) {
        const p = PRESETS[presetKey];
        if (!p) return;
        Object.keys(p).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = p[id];
        });
        updateRebarPreviews();
        calculate();
    }

    function collectInputs() {
        const getNum = (id, def = 0) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) || def : def;
        };

        const standard = window.pcalcState?.standard || 'nbr';
        const inputs = {
            bw: getNum('bw', 20),
            h: getNum('h', 50),
            c: getNum('c', 3.0),
            fck: getNum('fck', 30),
            fyk: getNum('fyk', 500),
            Msd: getNum('Msd', 100),
            Nsd: getNum('Nsd', 0),
            Vsd: getNum('Vsd', 60),
            num_barras: getNum('num_barras', 4),
            diam_barra: getNum('diam_barra', 16.0),
            num_barras_top: getNum('num_barras_top', 2),
            diam_barra_top: getNum('diam_barra_top', 10.0),
            diam_estribo: getNum('diam_estribo', 8.0),
            pernas_estribo: getNum('pernas_estribo', 2),
            s_estribo: getNum('s_estribo', 15),
            code: standard
        };

        if (activeRebarMode === 'bars' && customBars.length > 0) {
            inputs.bars = customBars;
        }

        return inputs;
    }

    /**
     * Solves Section under M-N-V locally as client-side fallback
     */
    function calculateClientSide(inputs) {
        const bw = inputs.bw;
        const h = inputs.h;
        const c = inputs.c;
        const fck = inputs.fck;
        const fyk = inputs.fyk;
        const Msd = inputs.Msd;
        const Nsd = inputs.Nsd;
        const Vsd = inputs.Vsd;
        const numBot = inputs.num_barras;
        const diamBot = inputs.diam_barra / 10.0;
        const numTop = inputs.num_barras_top;
        const diamTop = inputs.diam_barra_top / 10.0;
        const diamEst = inputs.diam_estribo / 10.0;
        const sEst = inputs.s_estribo;
        const legs = inputs.pernas_estribo;
        const code = inputs.code || 'nbr';

        const d = h - c - diamEst - (diamBot / 2.0);
        const d_prime = c + diamEst + (diamTop / 2.0);
        const As1 = numBot * (Math.PI * Math.pow(diamBot, 2) / 4.0);
        const As2 = numTop * (Math.PI * Math.pow(diamTop, 2) / 4.0);
        const Asw = legs * (Math.PI * Math.pow(diamEst, 2) / 4.0);

        // Parameters per code
        let gamma_c = 1.4, gamma_s = 1.15, phi_flex = 0.90, phi_v = 0.75, lambda_c = 0.8, alpha_c = 0.85;
        if (code === 'aci') {
            gamma_c = 1.0; gamma_s = 1.0; lambda_c = 0.85; alpha_c = 0.85;
        } else if (code === 'ec2') {
            gamma_c = 1.5; gamma_s = 1.15; lambda_c = 0.80; alpha_c = 1.0;
        }

        const fcd = (alpha_c * (fck / 10.0)) / gamma_c;
        const fyd = (fyk / 10.0) / gamma_s;

        // Neutral axis solver with axial load equilibrium: Fc(x) + Fs2(x) - Fs1(x) = -Nsd
        let low = 0.001;
        let high = h * 2.0;
        let x = h * 0.3;
        for (let iter = 0; iter < 40; iter++) {
            x = 0.5 * (low + high);
            const a = Math.min(lambda_c * x, h);
            const Fc = alpha_c * fcd * bw * a;
            const eps_cu = 0.0035;
            const eps_s1 = x > 0 ? eps_cu * (d - x) / x : 0.01;
            const sig_s1 = Math.max(-fyd, Math.min(fyd, eps_s1 * 20000.0));
            const eps_s2 = x > 0 ? eps_cu * (x - d_prime) / x : -0.002;
            const sig_s2 = Math.max(-fyd, Math.min(fyd, eps_s2 * 20000.0));
            const Fs1 = As1 * sig_s1;
            const Fs2 = As2 * sig_s2;
            const F_res = Fc + Fs2 - Fs1;
            const target = -Nsd; // Compressive Nsd < 0 => target > 0
            if (Math.abs(F_res - target) < 0.1) break;
            if (F_res < target) low = x;
            else high = x;
        }

        const a_final = Math.min(lambda_c * x, h);
        const Fc_final = alpha_c * fcd * bw * a_final;
        const arm_c = h / 2.0 - (a_final / 2.0);
        const eps_s1_f = x > 0 ? 0.0035 * (d - x) / x : 0.01;
        const sig_s1_f = Math.max(-fyd, Math.min(fyd, eps_s1_f * 20000.0));
        const eps_s2_f = x > 0 ? 0.0035 * (x - d_prime) / x : -0.002;
        const sig_s2_f = Math.max(-fyd, Math.min(fyd, eps_s2_f * 20000.0));

        let Mrd_kNcm = Fc_final * arm_c + (As2 * sig_s2_f) * (h / 2.0 - d_prime) + (As1 * sig_s1_f) * (d - h / 2.0);
        let Mrd_kNm = Math.max(1.0, Mrd_kNcm / 100.0);
        if (code === 'aci') {
            phi_flex = eps_s1_f >= 0.005 ? 0.90 : (eps_s1_f <= 0.002 ? 0.65 : 0.65 + 0.25 * ((eps_s1_f - 0.002) / 0.003));
            Mrd_kNm *= phi_flex;
        }

        // Shear resistance
        const Ac = bw * h;
        const sig_cp = Math.max(0, -Nsd / Ac);
        const fctd = (0.21 * Math.pow(fck, 2.0 / 3.0)) / 1.4 * 0.1;
        let Vc_kN = 0.6 * fctd * bw * d * 10.0 * (1.0 + Math.min(0.2, sig_cp / (fcd * 10)));
        if (Nsd > 0) Vc_kN = 0; // tension nullifies concrete shear contribution
        const fywd = Math.min(fyd, 43.5);
        const Vsw_kN = (Asw / sEst) * 0.9 * d * fywd * 10.0;
        let VRd_kN = Vc_kN + Vsw_kN;
        let VRd2_kN = 0.27 * (1.0 - fck / 250.0) * fcd * bw * (0.9 * d) * 10.0;

        if (code === 'aci') {
            const Nu_N = -Nsd * 1000.0;
            const axial_mod = Nu_N > 0 ? 1.0 + (Nu_N / (14.0 * Ac * 100)) : Math.max(0, 1.0 + (0.29 * Nu_N / (Ac * 100)));
            Vc_kN = (0.17 * Math.sqrt(fck) * (bw * 10) * (d * 10) / 1000.0) * axial_mod;
            const Vs_kN = (Asw * 100 * 420.0 * (d * 10) / (sEst * 10)) / 1000.0;
            VRd_kN = phi_v * (Vc_kN + Vs_kN);
            VRd2_kN = phi_v * (Vc_kN + (0.66 * Math.sqrt(fck) * (bw * 10) * (d * 10) / 1000.0));
        }

        // Generate 2D M-N interaction envelope
        const mnM = [];
        const mnN = [];
        const steps = 30;
        for (let k = 0; k <= steps; k++) {
            const x_k = 0.05 * h + (k / steps) * (1.5 * h);
            const a_k = Math.min(lambda_c * x_k, h);
            const Fc_k = alpha_c * fcd * bw * a_k;
            const eps_1 = x_k > 0 ? 0.0035 * (d - x_k) / x_k : 0.01;
            const s1 = Math.max(-fyd, Math.min(fyd, eps_1 * 20000.0));
            const eps_2 = x_k > 0 ? 0.0035 * (x_k - d_prime) / x_k : -0.002;
            const s2 = Math.max(-fyd, Math.min(fyd, eps_2 * 20000.0));
            const Fs1_k = As1 * s1;
            const Fs2_k = As2 * s2;
            const N_cap = -(Fc_k + Fs2_k - Fs1_k); // Compressive is negative
            const M_cap = (Fc_k * (h / 2.0 - a_k / 2.0) + (As2 * s2) * (h / 2.0 - d_prime) + (As1 * s1) * (d - h / 2.0)) / 100.0;
            if (M_cap >= 0) {
                mnM.push(round(M_cap, 1));
                mnN.push(round(N_cap, 1));
            }
        }

        const util_flex = Msd / Mrd_kNm;
        const util_shear = Vsd / VRd_kN;
        const util_biela = Vsd / VRd2_kN;
        const max_util = Math.max(util_flex, util_shear, util_biela);
        const is_safe = max_util <= 1.0;

        return {
            results: {
                code_name: code === 'nbr' ? 'NBR 6118:2023' : (code === 'aci' ? 'ACI 318-22' : 'Eurocode 2'),
                flexure_details: {
                    Mrd_kNm: round(Mrd_kNm, 1),
                    x: round(x, 1),
                    x_d_ratio: round(x / d, 3),
                    x_d_limit: 0.45,
                    is_ductile: (x / d) <= 0.45,
                    dominio: x / d < 0.259 ? 'Domínio 2' : 'Domínio 3',
                    rho_s_pct: round(((As1 + As2) / Ac) * 100.0, 2)
                },
                shear_details: {
                    VRd: round(VRd_kN, 1),
                    VRd2: round(VRd2_kN, 1),
                    Vc: round(Vc_kN, 1),
                    Vsw: round(Vsw_kN, 1)
                },
                summary: {
                    utilization_flexure: round(util_flex, 3),
                    utilization_shear: round(util_shear, 3),
                    utilization_biela: round(util_biela, 3),
                    max_util: round(max_util, 3),
                    is_safe: is_safe,
                    governing_failure: util_flex >= util_shear ? 'Flexão (M-N)' : 'Cisalhamento (V)'
                },
                mn_curve: { M: mnM, N: mnN }
            },
            inputs: inputs,
            active_code: code
        };
    }

    async function calculate() {
        const inputs = collectInputs();
        let data = null;

        if (window.eel && (window.eel.calculate_concrete_beam || window.eel.calculate_nbr_concrete)) {
            try {
                const eelFn = window.eel.calculate_concrete_beam || window.eel.calculate_nbr_concrete;
                const res = await eelFn(inputs)();
                if (res && res.results) {
                    data = res;
                }
            } catch (err) {
                console.warn("Eel calculation error, falling back to client solver:", err);
            }
        }

        if (!data) {
            data = calculateClientSide(inputs);
        }

        renderResults(data);
    }

    function renderResults(data) {
        if (!data) return;
        const res = data.results || {};
        const inputs = data.inputs || {};
        const sum = res.summary || {};
        const flx = res.flexure_details || {};
        const shr = res.shear_details || {};

        // Status banner
        const banner = document.getElementById('sec-status-banner');
        const statusIcon = document.getElementById('sec-status-icon');
        const statusTitle = document.getElementById('sec-status-title');
        const statusSub = document.getElementById('sec-status-sub');
        const statusBadge = document.getElementById('sec-status-badge');

        const maxPct = ((sum.max_util || 0) * 100).toFixed(1);
        if (banner) {
            if (sum.is_safe) {
                banner.className = "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl p-3 flex items-center justify-between shadow-sm";
                if (statusIcon) statusIcon.textContent = "✅";
                if (statusTitle) {
                    statusTitle.textContent = "SEÇÃO CONFORME (SEGURANÇA ATENDIDA)";
                    statusTitle.className = "text-sm font-bold text-emerald-800 dark:text-emerald-300";
                }
                if (statusSub) statusSub.textContent = `Atende aos critérios de dimensionamento da norma ${res.code_name || ''}.`;
                if (statusBadge) {
                    statusBadge.textContent = `Util: ${maxPct}%`;
                    statusBadge.className = "bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase";
                }
            } else {
                banner.className = "bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded-xl p-3 flex items-center justify-between shadow-sm";
                if (statusIcon) statusIcon.textContent = "❌";
                if (statusTitle) {
                    statusTitle.textContent = "SEÇÃO NÃO CONFORME (CAPACIDADE ESGOTADA)";
                    statusTitle.className = "text-sm font-bold text-red-800 dark:text-red-300";
                }
                if (statusSub) statusSub.textContent = `Limite crítico atingido em ${sum.governing_failure || 'Dimensionamento'}.`;
                if (statusBadge) {
                    statusBadge.textContent = `Util: ${maxPct}%`;
                    statusBadge.className = "bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase";
                }
            }
        }

        // KPIs
        const flxPct = ((sum.utilization_flexure || 0) * 100).toFixed(1);
        const shrPct = ((sum.utilization_shear || 0) * 100).toFixed(1);
        const biePct = ((sum.utilization_biela || 0) * 100).toFixed(1);

        const setVal = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        const setWidth = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = `${Math.min(100, pct)}%`; };

        setVal('sec-kpi-flex-val', `${flxPct}%`);
        setVal('sec-kpi-flex-detail', `${inputs.Msd || 0} / ${flx.Mrd_kNm || 0} kN·m`);
        setWidth('sec-kpi-flex-bar', flxPct);

        setVal('sec-kpi-shear-val', `${shrPct}%`);
        setVal('sec-kpi-shear-detail', `${inputs.Vsd || 0} / ${shr.VRd || 0} kN`);
        setWidth('sec-kpi-shear-bar', shrPct);

        setVal('sec-kpi-biela-val', `${biePct}%`);
        setVal('sec-kpi-biela-detail', `${inputs.Vsd || 0} / ${shr.VRd2 || 0} kN`);
        setWidth('sec-kpi-biela-bar', biePct);

        setVal('sec-kpi-dom-val', flx.dominio || 'Domínio 2/3');
        setVal('sec-kpi-rho-val', `ρ=${flx.rho_s_pct || 0}%`);
        setVal('sec-kpi-xd-detail', `x/d = ${flx.x_d_ratio || 0} (lim: ${flx.x_d_limit || 0.45})`);
        setWidth('sec-kpi-xd-bar', (flx.x_d_ratio || 0) / (flx.x_d_limit || 0.45) * 100);

        // Draw Canvases
        drawBeamCanvas(inputs, res);
        drawMnDiagram(inputs, res);

        // Detailed Report
        renderDetailedTable(data);
    }

    function drawBeamCanvas(inputs, res) {
        const canvas = document.getElementById('pcalcBeamCanvas');
        if (!canvas) return;

        const bw = parseFloat(inputs.bw) || 20;
        const h = parseFloat(inputs.h) || 50;
        const c = parseFloat(inputs.c) || 3;
        const numBot = parseInt(inputs.num_barras) || 4;
        const phiBot = (parseFloat(inputs.diam_barra) || 16) / 10.0;
        const numTop = parseInt(inputs.num_barras_top) || 2;
        const phiTop = (parseFloat(inputs.diam_barra_top) || 10) / 10.0;
        const phiEst = (parseFloat(inputs.diam_estribo) || 8) / 10.0;

        const flx = res?.flexure_details || {};
        const x_cm = flx.x || (h * 0.3);

        const cad = EngCAD.setupCanvas(canvas, 460, 290);
        if (!cad) return;
        const { ctx, width, height } = cad;
        const isDark = document.documentElement.classList.contains('dark');

        EngCAD.drawBackground(ctx, width, height, isDark);
        EngCAD.drawGrid(ctx, width, height, { isDark, step: 22 });

        const marginX = 70;
        const marginY = 48;
        const availW = width - 2 * marginX;
        const availH = height - 2 * marginY;
        const scale = Math.min(availW / bw, availH / h);

        const secW = bw * scale;
        const secH = h * scale;
        const originX = (width - secW) / 2;
        const originY = (height - secH) / 2;

        ctx.save();
        ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(241, 245, 249, 0.9)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.0;
        ctx.fillRect(originX, originY, secW, secH);
        ctx.strokeRect(originX, originY, secW, secH);

        // Compressed Zone
        const compH = Math.min(secH, Math.max(2, (0.8 * x_cm) * scale));
        ctx.fillStyle = isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(originX, originY, secW, compH);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(originX, originY + compH);
        ctx.lineTo(originX + secW, originY + compH);
        ctx.stroke();

        // Neutral Axis
        const lnY = originY + x_cm * scale;
        EngCAD.drawNeutralAxis(ctx, originX - 12, lnY, originX + secW + 12, lnY, `L.N. (x = ${x_cm.toFixed(1)} cm)`, { isDark });

        // Stirrup
        const stX = originX + c * scale;
        const stY = originY + c * scale;
        const stW = Math.max(8, secW - 2 * c * scale);
        const stH = Math.max(8, secH - 2 * c * scale);
        EngCAD.drawStirrup(ctx, stX, stY, stW, stH, 6, { isDark, stroke: '#38bdf8', lineWidth: 1.8 });

        // Bars
        if (activeRebarMode === 'bars' && customBars.length > 0) {
            customBars.forEach(b => {
                const bx = originX + b.x * scale;
                const by = originY + secH - b.y * scale;
                const rPx = Math.max(3, (b.diametro / 20.0) * scale);
                EngCAD.drawRebar(ctx, bx, by, rPx, { isDark, fill: '#3b82f6', stroke: '#1d4ed8' });
            });
        } else {
            // Bottom Steel
            const botY = originY + secH - (c + phiEst + phiBot / 2) * scale;
            const xStartBot = originX + (c + phiEst + phiBot / 2) * scale;
            const xEndBot = originX + secW - (c + phiEst + phiBot / 2) * scale;
            const rBotPx = Math.max(3, (phiBot * scale) / 2);

            for (let i = 0; i < numBot; i++) {
                const bx = numBot > 1 ? xStartBot + i * (xEndBot - xStartBot) / (numBot - 1) : originX + secW / 2;
                EngCAD.drawRebar(ctx, bx, botY, rBotPx, { isDark, fill: '#3b82f6', stroke: '#1d4ed8' });
            }

            // Top Steel
            if (numTop > 0) {
                const topY = originY + (c + phiEst + phiTop / 2) * scale;
                const xStartTop = originX + (c + phiEst + phiTop / 2) * scale;
                const xEndTop = originX + secW - (c + phiEst + phiTop / 2) * scale;
                const rTopPx = Math.max(2.5, (phiTop * scale) / 2);

                for (let i = 0; i < numTop; i++) {
                    const bx = numTop > 1 ? xStartTop + i * (xEndTop - xStartTop) / (numTop - 1) : originX + secW / 2;
                    EngCAD.drawRebar(ctx, bx, topY, rTopPx, { isDark, fill: '#f59e0b', stroke: '#b45309' });
                }
            }
        }

        // Dimensions
        EngCAD.drawDimension(ctx, originX, originY + secH, originX + secW, originY + secH, `${bw} cm`, { offset: 22, isDark });
        EngCAD.drawDimension(ctx, originX, originY + secH, originX, originY, `${h} cm`, { offset: -24, isDark });
        ctx.restore();
    }

    function drawMnDiagram(inputs, res) {
        const canvas = document.getElementById('pcalcMnCanvas');
        if (!canvas) return;

        const curve = res?.mn_curve || { N: [], M: [] };
        const Msd = parseFloat(inputs.Msd) || 0;
        const Nsd = parseFloat(inputs.Nsd) || 0;

        const cad = EngCAD.setupCanvas(canvas, 460, 290);
        if (!cad) return;
        const { ctx, width, height } = cad;
        const isDark = document.documentElement.classList.contains('dark');

        EngCAD.drawBackground(ctx, width, height, isDark);
        EngCAD.drawGrid(ctx, width, height, { isDark, step: 22 });

        if (!curve.N || curve.N.length === 0) {
            ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Calculando Envoltória M-N...', width / 2, height / 2);
            return;
        }

        const maxM = Math.max(Msd * 1.25, ...curve.M, 50.0);
        const minN = Math.min(Nsd * 1.2, ...curve.N, -50.0);
        const maxN = Math.max(Nsd * 1.2, ...curve.N, 50.0);

        const padLeft = 55;
        const padRight = 30;
        const padTop = 30;
        const padBot = 40;
        const plotW = width - padLeft - padRight;
        const plotH = height - padTop - padBot;

        const toPxM = (m) => padLeft + (m / maxM) * plotW;
        const toPxN = (n) => padTop + plotH - ((n - minN) / (maxN - minN)) * plotH;

        // Zero-line
        const zeroN_Y = toPxN(0);
        ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.40)' : 'rgba(100, 116, 139, 0.40)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padLeft, zeroN_Y);
        ctx.lineTo(padLeft + plotW, zeroN_Y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Fill Envelope
        ctx.beginPath();
        for (let i = 0; i < curve.N.length; i++) {
            const px = toPxM(curve.M[i]);
            const py = toPxN(curve.N[i]);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.lineTo(padLeft, toPxN(curve.N[curve.N.length - 1]));
        ctx.lineTo(padLeft, toPxN(curve.N[0]));
        ctx.closePath();

        const envGrad = ctx.createLinearGradient(padLeft, padTop, padLeft + plotW, padTop + plotH);
        envGrad.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
        envGrad.addColorStop(1, 'rgba(147, 51, 234, 0.10)');
        ctx.fillStyle = envGrad;
        ctx.fill();

        // Stroke Envelope
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i < curve.N.length; i++) {
            const px = toPxM(curve.M[i]);
            const py = toPxN(curve.N[i]);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Load point
        const ptX = toPxM(Msd);
        const ptY = toPxN(Nsd);

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(padLeft, ptY);
        ctx.lineTo(ptX, ptY);
        ctx.lineTo(ptX, padTop + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(ptX, ptY, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ptX, ptY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        // Labels
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
        ctx.textAlign = 'center';
        ctx.fillText('Momento M [kN·m]', padLeft + plotW / 2, height - 8);

        ctx.save();
        ctx.translate(14, padTop + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Normal N [kN] (Compr. < 0 < Tração)', 0, 0);
        ctx.restore();

        // Ticks
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.textAlign = 'right';
        ctx.fillText(`${maxN.toFixed(0)}`, padLeft - 5, toPxN(maxN) + 3);
        ctx.fillText(`0`, padLeft - 5, zeroN_Y + 3);
        ctx.fillText(`${minN.toFixed(0)}`, padLeft - 5, toPxN(minN) + 3);
        ctx.textAlign = 'center';
        ctx.fillText('0', padLeft, padTop + plotH + 14);
        ctx.fillText(`${maxM.toFixed(0)}`, padLeft + plotW, padTop + plotH + 14);
    }

    function renderDetailedTable(data) {
        const container = document.getElementById('sec-results-container');
        if (!container) return;

        const res = data.results || {};
        const inputs = data.inputs || {};
        const flx = res.flexure_details || {};
        const shr = res.shear_details || {};
        const sum = res.summary || {};

        let html = `
            <div class="overflow-x-auto">
                <table class="w-full text-xs text-left text-gray-700 dark:text-gray-300">
                    <thead class="bg-gray-100 dark:bg-gray-700/80 font-bold uppercase text-[11px] text-gray-600 dark:text-gray-300">
                        <tr>
                            <th class="px-3 py-2">Critério / Verificação</th>
                            <th class="px-3 py-2">Solicitante (Sd)</th>
                            <th class="px-3 py-2">Resistente (Rd)</th>
                            <th class="px-3 py-2 text-center">Taxa (Util.)</th>
                            <th class="px-3 py-2 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700 font-mono">
                        <tr>
                            <td class="px-3 py-2 font-sans font-medium">Flexão Simples/Composta (M-N)</td>
                            <td class="px-3 py-2">${inputs.Msd || 0} kN·m (N=${inputs.Nsd || 0} kN)</td>
                            <td class="px-3 py-2 font-bold text-blue-600 dark:text-blue-400">${flx.Mrd_kNm || 0} kN·m</td>
                            <td class="px-3 py-2 text-center font-bold">${((sum.utilization_flexure || 0) * 100).toFixed(1)}%</td>
                            <td class="px-3 py-2 text-center">${sum.utilization_flexure <= 1.0 ? '<span class="text-emerald-600 font-bold">OK</span>' : '<span class="text-red-600 font-bold">NÃO ATENDE</span>'}</td>
                        </tr>
                        <tr>
                            <td class="px-3 py-2 font-sans font-medium">Esforço Cortante (Estribos Asw/s)</td>
                            <td class="px-3 py-2">${inputs.Vsd || 0} kN</td>
                            <td class="px-3 py-2 font-bold text-purple-600 dark:text-purple-400">${shr.VRd || 0} kN</td>
                            <td class="px-3 py-2 text-center font-bold">${((sum.utilization_shear || 0) * 100).toFixed(1)}%</td>
                            <td class="px-3 py-2 text-center">${sum.utilization_shear <= 1.0 ? '<span class="text-emerald-600 font-bold">OK</span>' : '<span class="text-red-600 font-bold">NÃO ATENDE</span>'}</td>
                        </tr>
                        <tr>
                            <td class="px-3 py-2 font-sans font-medium">Esmagamento da Biela Comprimida</td>
                            <td class="px-3 py-2">${inputs.Vsd || 0} kN</td>
                            <td class="px-3 py-2 font-bold">${shr.VRd2 || 0} kN</td>
                            <td class="px-3 py-2 text-center font-bold">${((sum.utilization_biela || 0) * 100).toFixed(1)}%</td>
                            <td class="px-3 py-2 text-center">${sum.utilization_biela <= 1.0 ? '<span class="text-emerald-600 font-bold">OK</span>' : '<span class="text-red-600 font-bold">NÃO ATENDE</span>'}</td>
                        </tr>
                        <tr>
                            <td class="px-3 py-2 font-sans font-medium">Ductilidade da Linha Neutra (x/d)</td>
                            <td class="px-3 py-2">x/d = ${flx.x_d_ratio || 0}</td>
                            <td class="px-3 py-2">&le; ${flx.x_d_limit || 0.45}</td>
                            <td class="px-3 py-2 text-center font-bold">${(((flx.x_d_ratio || 0) / (flx.x_d_limit || 0.45)) * 100).toFixed(1)}%</td>
                            <td class="px-3 py-2 text-center">${flx.is_ductile ? '<span class="text-emerald-600 font-bold">DÚCTIL</span>' : '<span class="text-amber-600 font-bold">FRÁGIL</span>'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = html;
    }

    function init() {
        const secInputIds = [
            'bw', 'h', 'c', 'fck', 'fyk', 'Msd', 'Nsd', 'Vsd',
            'num_barras', 'diam_barra', 'num_barras_top', 'diam_barra_top',
            'diam_estribo', 'pernas_estribo', 's_estribo'
        ];

        secInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    updateRebarPreviews();
                });
                el.addEventListener('change', () => {
                    updateRebarPreviews();
                    calculate();
                });
            }
        });

        updateRebarPreviews();
    }

    return {
        init,
        calculate,
        switchRebarMode,
        generateRebarPattern,
        addRebarRow,
        removeBar,
        updateBarProp,
        loadPreset,
        updateRebarPreviews
    };
})();
