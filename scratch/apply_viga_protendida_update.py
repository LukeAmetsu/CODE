# apply_viga_protendida_update.py
import re

file_path = r"c:\OD\OneDrive - Andrade Gutierrez\CODE-2\nbr\viga_protendida.js"
with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# 1. New renderExecutiveSummary and updated renderResults
new_render_results = '''function renderExecutiveSummary(checks, inputs) {
    const { uls_checks, prestress_checks, properties, materials, moments } = checks;
    const isUlsOk = uls_checks && uls_checks.ratio <= 1.0;
    const ratioPct = uls_checks && !isNaN(uls_checks.ratio) ? (uls_checks.ratio * 100).toFixed(1) : 'N/A';
    const P0_kN = prestress_checks?.P_i ? Math.round(prestress_checks.P_i) : 0;
    
    // Estimate P_inf from loss_results midspan if available
    let Pinf_kN = 0;
    if (checks.loss_results?.sigma_p_inf && checks.loss_results.sigma_p_inf.length > 0) {
        const midIdx = Math.floor(checks.loss_results.sigma_p_inf.length / 2);
        const avgSigmaInf = checks.loss_results.sigma_p_inf[midIdx]?.value || 0;
        const Ap_total_m2 = (parseFloat(inputs.Ap) * inputs.cables.reduce((s, c) => s + c.num_strands, 0)) / 10000;
        Pinf_kN = Math.round(avgSigmaInf * Ap_total_m2 * 1000);
    }
    if (Pinf_kN === 0 && P0_kN > 0) {
        Pinf_kN = Math.round(P0_kN * 0.82);
    }
    const lossPct = P0_kN > 0 ? (((P0_kN - Pinf_kN) / P0_kN) * 100).toFixed(1) : '0.0';
    
    const total_strands = inputs.cables.reduce((s, c) => s + c.num_strands, 0);
    const Ap_total = (parseFloat(inputs.Ap) * total_strands).toFixed(2);
    
    const sig_i_top = checks.stress_profiles?.initial?.top !== undefined ? Number(checks.stress_profiles.initial.top).toFixed(2) : '0.00';
    const sig_i_bot = checks.stress_profiles?.initial?.bottom !== undefined ? Number(checks.stress_profiles.initial.bottom).toFixed(2) : '0.00';
    const sig_f_top = checks.stress_profiles?.final?.top !== undefined ? Number(checks.stress_profiles.final.top).toFixed(2) : '0.00';
    const sig_f_bot = checks.stress_profiles?.final?.bottom !== undefined ? Number(checks.stress_profiles.final.bottom).toFixed(2) : '0.00';

    const cardUls = h('div', { className: 'bg-white dark:bg-gray-800/95 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden' }, [
        h('div', { className: 'flex items-center justify-between mb-2' }, [
            h('span', { className: 'text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400' }, ['Segurança ELU']),
            h('span', { className: `px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${isUlsOk ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'}` }, [
                isUlsOk ? '✓ APROVADO (OK)' : '⚠ NÃO CONFORME'
            ])
        ]),
        h('div', { className: 'flex items-baseline gap-2 mb-2' }, [
            h('span', { className: 'text-2xl font-black text-gray-900 dark:text-white' }, [`${ratioPct}%`]),
            h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, ['taxa de trabalho flexão'])
        ]),
        h('div', { className: 'w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden mb-3' }, [
            h('div', { className: `h-full rounded-full ${isUlsOk ? 'bg-emerald-500' : 'bg-rose-500'}`, style: { width: `${Math.min(100, Math.max(5, parseFloat(ratioPct) || 0))}%` } })
        ]),
        h('div', { className: 'grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 font-mono' }, [
            h('div', {}, [`MSd: `, h('b', {}, [`${uls_checks?.Md_kNm?.toFixed(1) || 0} kNm`])]),
            h('div', {}, [`MRd: `, h('b', {}, [`${uls_checks?.MRd_kNm?.toFixed(1) || 0} kNm`])]),
            h('div', {}, [`LN x: `, h('b', {}, [`${((uls_checks?.x_m || 0) * 100).toFixed(1)} cm`])]),
            h('div', {}, [`dp: `, h('b', {}, [`${((uls_checks?.d_p || 0) * 100).toFixed(1)} cm`])])
        ])
    ]);

    const cardPrestress = h('div', { className: 'bg-white dark:bg-gray-800/95 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden' }, [
        h('div', { className: 'flex items-center justify-between mb-2' }, [
            h('span', { className: 'text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400' }, ['Força & Perdas']),
            h('span', { className: 'px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30' }, [`-${lossPct}% perdas`])
        ]),
        h('div', { className: 'flex items-baseline gap-2 mb-2' }, [
            h('span', { className: 'text-2xl font-black text-amber-600 dark:text-amber-400' }, [`${Pinf_kN} kN`]),
            h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, ['força efetiva P∞'])
        ]),
        h('div', { className: 'grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 font-mono pt-2 border-t dark:border-gray-700' }, [
            h('div', {}, [`P₀ (Inicial): `, h('b', {}, [`${P0_kN} kN`])]),
            h('div', {}, [`ΔP (Perdas): `, h('b', {}, [`${P0_kN - Pinf_kN} kN`])]),
            h('div', {}, [`Atrito μ: `, h('b', {}, [`${inputs.mu}`])]),
            h('div', {}, [`Acomodação: `, h('b', {}, [`${inputs.anchorage_slip} mm`])])
        ])
    ]);

    const cardStresses = h('div', { className: 'bg-white dark:bg-gray-800/95 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden' }, [
        h('div', { className: 'flex items-center justify-between mb-2' }, [
            h('span', { className: 'text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400' }, ['Tensões Concreto ELS']),
            h('span', { className: 'px-2 py-0.5 rounded text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30' }, ['Meio do Vão'])
        ]),
        h('div', { className: 'space-y-2 pt-1 text-xs' }, [
            h('div', { className: 'flex justify-between items-center p-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg' }, [
                h('span', { className: 'text-gray-500 dark:text-gray-400' }, ['Transferência (t₀):']),
                h('span', { className: 'font-mono font-bold' }, [`Sup: ${sig_i_top} | Inf: ${sig_i_bot} MPa`])
            ]),
            h('div', { className: 'flex justify-between items-center p-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg' }, [
                h('span', { className: 'text-gray-500 dark:text-gray-400' }, ['Serviço (t∞):']),
                h('span', { className: 'font-mono font-bold' }, [`Sup: ${sig_f_top} | Inf: ${sig_f_bot} MPa`])
            ])
        ])
    ]);

    const cardSection = h('div', { className: 'bg-white dark:bg-gray-800/95 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden' }, [
        h('div', { className: 'flex items-center justify-between mb-2' }, [
            h('span', { className: 'text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400' }, ['Seção & Cordoalhas']),
            h('span', { className: 'px-2 py-0.5 rounded text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30' }, [`${total_strands} cordoalhas`])
        ]),
        h('div', { className: 'flex items-baseline gap-2 mb-2' }, [
            h('span', { className: 'text-2xl font-black text-purple-600 dark:text-purple-400' }, [`${Ap_total} cm²`]),
            h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, ['área total Ap'])
        ]),
        h('div', { className: 'grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 font-mono pt-2 border-t dark:border-gray-700' }, [
            h('div', {}, [`Ac: `, h('b', {}, [`${properties.area.toFixed(0)} cm²`])]),
            h('div', {}, [`h: `, h('b', {}, [`${properties.height.toFixed(0)} cm`])]),
            h('div', {}, [`ycg: `, h('b', {}, [`${properties.centroid.y.toFixed(1)} cm`])]),
            h('div', {}, [`emid: `, h('b', {}, [`${(checks.avg_ecc_mid * 100).toFixed(1)} cm`])])
        ])
    ]);

    return h('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6' }, [
        cardUls, cardPrestress, cardStresses, cardSection
    ]);
}

function renderResults(results) {
    const resultsDiv = document.getElementById('results-container');
    const { checks, inputs, errors } = results;
    if (!checks || errors) {
        resultsDiv.innerHTML = '';
        resultsDiv.appendChild(h('div', { className: 'p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-center text-rose-600 dark:text-rose-400 font-bold text-sm' }, [
            `Falha no cálculo: ${errors?.[0] || 'Verifique as coordenadas dos vértices e configuração dos cabos.'}`
        ]));
        return;
    }

    const reportTitle = "Relatório de Verificação da Viga Protendida (NBR 6118)";
    const reportEl = h('div', { id: 'concrete-beam-report', className: 'space-y-6' }, [
        // Executive Summary Cards
        renderExecutiveSummary(checks, inputs),
        // Toolbar
        h('div', { className: 'flex justify-end gap-2 print-hidden' }, [
            h('button', { id: 'copy-report-btn', className: 'bg-blue-600 text-white py-1.5 px-3.5 rounded-xl text-xs font-bold hover:bg-blue-700 transition shadow-sm' }, ['📋 Copiar Relatório']),
            h('button', { id: 'download-word-btn', className: 'bg-indigo-700 text-white py-1.5 px-3.5 rounded-xl text-xs font-bold hover:bg-indigo-800 transition shadow-sm' }, ['📄 Word']),
            h('button', { id: 'download-pdf-btn', className: 'bg-rose-600 text-white py-1.5 px-3.5 rounded-xl text-xs font-bold hover:bg-rose-700 transition shadow-sm' }, ['📑 PDF'])
        ]),
        h('h1', { id: 'main-title', className: 'text-xl font-black text-center border-b pb-3 text-gray-900 dark:text-white' }, [reportTitle]),
        renderInputSummary(inputs, checks),
        renderCalculatedProperties(checks, inputs),
        renderPrestressEstimation(checks),
        renderDetailedLossCalculations(checks.loss_results),
        renderLossesTableAndChart(checks.loss_results),
        renderPrestressChecks(checks),
        renderUlsChecks(checks)
    ]);

    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(reportEl);

    // Re-attach listeners for the toolbar buttons
    document.getElementById('copy-report-btn')?.addEventListener('click', () => handleCopy('concrete-beam-report'));
    document.getElementById('download-word-btn')?.addEventListener('click', () => handleDownloadWord('concrete-beam-report', 'Viga_Protendida.doc'));
    document.getElementById('download-pdf-btn')?.addEventListener('click', () => handleDownloadPdf('concrete-beam-report', 'Viga_Protendida.pdf'));

    drawStressDiagram('stress-diagram-canvas', results.checks);
    drawLossesChart('losses-chart-canvas', checks.loss_results);
}'''

# Replace old renderResults
old_render_pat = r"function renderResults\(results\) \{.*?drawLossesChart\('losses-chart-canvas', checks\.loss_results\);\s*\}"
assert re.search(old_render_pat, code, re.DOTALL) is not None, "old renderResults not found"
code = re.sub(old_render_pat, new_render_results, code, flags=re.DOTALL)

# 2. Presets definition & new UI / CAD drawing functions
new_ui_and_cad = '''// --- PRESETS DE VIGAS PROTENDIDAS ---
const prestressedPresets = {
    viga_i_ponte: {
        title: "Viga I (Pontes / OAEs - 20m)",
        beam_length: 20,
        load_pp: 7.5,
        load_perm: 12.0,
        load_var: 16.0,
        fck: 35,
        fptk: 1900,
        Ap: "1.40",
        humidity: 70,
        mu: 0.20,
        k: 0.0020,
        anchorage_slip: 6.0,
        exposed_perimeter: 2.8,
        cement_s_factor: "0.25",
        beam_coords: `0, 100
50, 100
50, 85
34, 85
34, 15
47.5, 15
47.5, 0
2.5, 0
2.5, 15
16, 15
16, 85
0, 85`,
        cables: [
            {
                age_at_prestress: 7,
                num_strands: 12,
                path: [
                    { x: 0, y: 0.45, type: 'Parabolic' },
                    { x: 10, y: 0.10, type: 'Parabolic' },
                    { x: 20, y: 0.45, type: 'Straight' }
                ]
            },
            {
                age_at_prestress: 7,
                num_strands: 12,
                path: [
                    { x: 0, y: 0.65, type: 'Parabolic' },
                    { x: 10, y: 0.18, type: 'Parabolic' },
                    { x: 20, y: 0.65, type: 'Straight' }
                ]
            }
        ]
    },
    viga_t_edificio: {
        title: "Viga T (Edifícios / Lajes - 16m)",
        beam_length: 16,
        load_pp: 5.5,
        load_perm: 8.0,
        load_var: 10.0,
        fck: 40,
        fptk: 1900,
        Ap: "1.40",
        humidity: 65,
        mu: 0.20,
        k: 0.0020,
        anchorage_slip: 6.0,
        exposed_perimeter: 2.4,
        cement_s_factor: "0.25",
        beam_coords: `0, 80
100, 80
100, 68
62.5, 68
62.5, 0
37.5, 0
37.5, 68
0, 68`,
        cables: [
            {
                age_at_prestress: 7,
                num_strands: 10,
                path: [
                    { x: 0, y: 0.40, type: 'Parabolic' },
                    { x: 8, y: 0.10, type: 'Parabolic' },
                    { x: 16, y: 0.40, type: 'Straight' }
                ]
            },
            {
                age_at_prestress: 7,
                num_strands: 8,
                path: [
                    { x: 0, y: 0.55, type: 'Parabolic' },
                    { x: 8, y: 0.18, type: 'Parabolic' },
                    { x: 16, y: 0.55, type: 'Straight' }
                ]
            }
        ]
    },
    viga_caixao: {
        title: "Viga Caixão (Passarelas - 24m)",
        beam_length: 24,
        load_pp: 14.0,
        load_perm: 15.0,
        load_var: 18.0,
        fck: 45,
        fptk: 1900,
        Ap: "1.40",
        humidity: 70,
        mu: 0.19,
        k: 0.0018,
        anchorage_slip: 6.0,
        exposed_perimeter: 3.8,
        cement_s_factor: "0.20",
        beam_coords: `0, 120
140, 120
140, 100
120, 100
110, 20
100, 0
40, 0
30, 20
20, 100
0, 100`,
        cables: [
            {
                age_at_prestress: 7,
                num_strands: 12,
                path: [
                    { x: 0, y: 0.55, type: 'Parabolic' },
                    { x: 12, y: 0.12, type: 'Parabolic' },
                    { x: 24, y: 0.55, type: 'Straight' }
                ]
            },
            {
                age_at_prestress: 7,
                num_strands: 12,
                path: [
                    { x: 0, y: 0.75, type: 'Parabolic' },
                    { x: 12, y: 0.20, type: 'Parabolic' },
                    { x: 24, y: 0.75, type: 'Straight' }
                ]
            },
            {
                age_at_prestress: 7,
                num_strands: 8,
                path: [
                    { x: 0, y: 0.95, type: 'Parabolic' },
                    { x: 12, y: 0.28, type: 'Parabolic' },
                    { x: 24, y: 0.95, type: 'Straight' }
                ]
            }
        ]
    },
    viga_retangular: {
        title: "Viga Retangular (12m)",
        beam_length: 12,
        load_pp: 4.2,
        load_perm: 6.0,
        load_var: 8.0,
        fck: 35,
        fptk: 1900,
        Ap: "1.40",
        humidity: 70,
        mu: 0.20,
        k: 0.0020,
        anchorage_slip: 6.0,
        exposed_perimeter: 2.0,
        cement_s_factor: "0.25",
        beam_coords: `0, 70
30, 70
30, 0
0, 0`,
        cables: [
            {
                age_at_prestress: 7,
                num_strands: 7,
                path: [
                    { x: 0, y: 0.35, type: 'Parabolic' },
                    { x: 6, y: 0.08, type: 'Parabolic' },
                    { x: 12, y: 0.35, type: 'Straight' }
                ]
            },
            {
                age_at_prestress: 7,
                num_strands: 5,
                path: [
                    { x: 0, y: 0.48, type: 'Parabolic' },
                    { x: 6, y: 0.16, type: 'Parabolic' },
                    { x: 12, y: 0.48, type: 'Straight' }
                ]
            }
        ]
    }
};

window.loadPrestressedPreset = function(presetKey, triggerDraw = true) {
    const preset = prestressedPresets[presetKey];
    if (!preset) return;
    
    // 1. Populate Standard Inputs
    if (preset.beam_length !== undefined) document.getElementById('beam_length').value = preset.beam_length;
    if (preset.load_pp !== undefined) document.getElementById('load_pp').value = preset.load_pp;
    if (preset.load_perm !== undefined) document.getElementById('load_perm').value = preset.load_perm;
    if (preset.load_var !== undefined) document.getElementById('load_var').value = preset.load_var;
    if (preset.fck !== undefined) document.getElementById('fck').value = preset.fck;
    if (preset.fptk !== undefined) document.getElementById('fptk').value = preset.fptk;
    if (preset.Ap !== undefined) document.getElementById('Ap').value = preset.Ap;
    if (preset.humidity !== undefined) document.getElementById('humidity').value = preset.humidity;
    if (preset.mu !== undefined) document.getElementById('mu').value = preset.mu;
    if (preset.k !== undefined) document.getElementById('k').value = preset.k;
    if (preset.anchorage_slip !== undefined) document.getElementById('anchorage_slip').value = preset.anchorage_slip;
    if (preset.exposed_perimeter !== undefined) document.getElementById('exposed_perimeter').value = preset.exposed_perimeter;
    if (preset.cement_s_factor !== undefined) document.getElementById('cement_s_factor').value = preset.cement_s_factor;
    if (preset.beam_coords !== undefined) document.getElementById('beam_coords').value = preset.beam_coords;
    
    // 2. Rebuild Cables
    const container = document.getElementById('cables-list-container');
    if (container) {
        container.innerHTML = '';
        preset.cables.forEach(c => addCableGroup('cables-list-container', c));
    }
    
    // 3. Highlight Preset Buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.includes(`'${presetKey}'`)) {
            btn.className = 'preset-btn px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-md shadow-blue-500/30 border border-blue-500 transition-all flex items-center gap-1.5 scale-105';
        } else {
            btn.className = 'preset-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 transition-all flex items-center gap-1.5';
        }
    });
    
    // 4. Trigger Draw
    if (triggerDraw) {
        window.dispatchEvent(new Event('input'));
    }
};

// --- HELPER FUNCTIONS FOR UI ---

const CABLE_THEME_COLORS = [
    { border: 'border-l-amber-500', title: 'text-amber-600 dark:text-amber-400', stroke: '#f59e0b' },
    { border: 'border-l-sky-500', title: 'text-sky-600 dark:text-sky-400', stroke: '#0284c7' },
    { border: 'border-l-emerald-500', title: 'text-emerald-600 dark:text-emerald-400', stroke: '#10b981' },
    { border: 'border-l-purple-500', title: 'text-purple-600 dark:text-purple-400', stroke: '#8b5cf6' }
];

function addCableGroup(containerId, data = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const index = container.children.length + 1;
    const theme = CABLE_THEME_COLORS[(index - 1) % CABLE_THEME_COLORS.length];
    
    const card = document.createElement('div');
    card.className = `cable-group-card border border-gray-200 dark:border-gray-700 ${theme.border} border-l-4 rounded-xl p-3.5 mb-3 bg-white dark:bg-gray-800/90 shadow-sm relative transition-all`;
    card.innerHTML = `
        <div class="flex justify-between items-center mb-2.5 pb-2 border-b border-gray-100 dark:border-gray-700">
            <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full" style="background: ${theme.stroke};"></span>
                <h3 class="font-bold text-xs ${theme.title} uppercase tracking-wider">Cabo ${index}</h3>
            </div>
            <button type="button" class="remove-group-btn text-rose-500 hover:text-rose-700 dark:text-rose-400 text-[11px] font-bold px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors">Excluir Cabo</button>
        </div>
        <div class="grid grid-cols-2 gap-2.5 mb-3">
            <div>
                <label class="block text-[11px] font-medium mb-1 text-gray-500 dark:text-gray-400">Idade t₀ (dias)</label>
                <input type="number" class="cable-age w-full p-1.5 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-gray-800 dark:text-gray-100" value="${data ? data.age_at_prestress : 7}">
            </div>
            <div>
                <label class="block text-[11px] font-medium mb-1 text-gray-500 dark:text-gray-400">Nº Cordoalhas</label>
                <input type="number" class="cable-strands w-full p-1.5 text-xs font-mono font-bold border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-gray-800 dark:text-gray-100" value="${data ? data.num_strands : 12}">
            </div>
        </div>
        <div class="cable-points-container space-y-1.5">
            <div class="grid grid-cols-[1.1fr_1fr_1.2fr_auto] gap-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                <span>X (m)</span><span>Y (m)</span><span>Traçado</span><span></span>
            </div>
        </div>
        <button type="button" class="add-point-btn mt-2.5 text-[11px] font-semibold w-full bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-600 py-1.5 rounded-lg text-gray-700 dark:text-gray-200 transition-colors flex items-center justify-center gap-1">
            <span>+</span> Adicionar Ponto ao Cabo ${index}
        </button>
    `;
    const pointsContainer = card.querySelector('.cable-points-container');
    const initialPoints = data ? data.path : [{ x: 0, y: 0.45, type: 'Parabolic' }, { x: 10, y: 0.10, type: 'Parabolic' }, { x: 20, y: 0.45, type: 'Straight' }];
    initialPoints.forEach(p => addPointRow(pointsContainer, p));
    card.querySelector('.add-point-btn').addEventListener('click', () => addPointRow(pointsContainer));
    card.querySelector('.remove-group-btn').addEventListener('click', () => { card.remove(); window.dispatchEvent(new Event('input')); });
    card.querySelectorAll('input').forEach(i => i.addEventListener('input', () => window.dispatchEvent(new Event('input'))));
    container.appendChild(card);
}

function addPointRow(container, point = { x: 0, y: 0.45, type: 'Parabolic' }) {
    const row = document.createElement('div');
    row.className = 'cable-path-row grid grid-cols-[1.1fr_1fr_1.2fr_auto] gap-1.5 items-center';
    row.innerHTML = `
        <input type="number" step="0.5" class="cable-x w-full p-1 text-xs font-mono border border-gray-200 dark:border-gray-600 rounded dark:bg-gray-700 text-gray-800 dark:text-gray-100" value="${point.x}">
        <input type="number" step="0.02" class="cable-y w-full p-1 text-xs font-mono border border-gray-200 dark:border-gray-600 rounded dark:bg-gray-700 text-gray-800 dark:text-gray-100" value="${point.y}">
        <select class="cable-type w-full p-1 text-[11px] border border-gray-200 dark:border-gray-600 rounded dark:bg-gray-700 text-gray-800 dark:text-gray-100">
            <option value="Parabolic" ${point.type === 'Parabolic' ? 'selected' : ''}>Paráb.</option>
            <option value="Straight" ${point.type === 'Straight' ? 'selected' : ''}>Reto</option>
        </select>
        <button type="button" class="remove-point text-gray-400 hover:text-rose-500 font-bold px-1.5 text-sm leading-none transition-colors" title="Remover ponto">&times;</button>
    `;
    row.querySelector('.remove-point').addEventListener('click', () => { row.remove(); window.dispatchEvent(new Event('input')); });
    row.querySelectorAll('input, select').forEach(i => i.addEventListener('input', () => window.dispatchEvent(new Event('input'))));
    container.appendChild(row);
}

// --- CAD CANVAS RENDERING: SEÇÃO TRANSVERSAL 2D ---

function drawCrossSectionDiagram(canvasId, inputsOrVertices) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const vertices = Array.isArray(inputsOrVertices) ? inputsOrVertices : (inputsOrVertices?.vertices || []);
    const cables = Array.isArray(inputsOrVertices) ? [] : (inputsOrVertices?.cables || []);
    const beam_length = inputsOrVertices?.beam_length || 20;
    
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 280;
    const h = rect.height || 280;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Background Dark Slate CAD
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#090d16');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    
    if (!vertices || vertices.length < 3) {
        ctx.fillStyle = '#64748b';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Defina ao menos 3 vértices na seção', w / 2, h / 2);
        return;
    }
    
    const props = concreteBeamCalculator.calculateSectionProperties(vertices);
    if (!props) return;
    
    // Update Height badge and Input
    const hBadge = document.getElementById('beam-height-badge');
    if (hBadge) hBadge.textContent = `h = ${props.height.toFixed(0)} cm`;
    const hInput = document.getElementById('beam_height');
    if (hInput && Math.abs(parseFloat(hInput.value) - props.height) > 0.1) {
        hInput.value = props.height.toFixed(0);
    }
    
    // Bounding Box
    const xs = vertices.map(v => v[0]);
    const ys = vertices.map(v => v[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), dx = maxX - minX || 1;
    const minY = Math.min(...ys), maxY = Math.max(...ys), dy = maxY - minY || 1;
    
    const padLeft = 46, padRight = 30, padTop = 32, padBottom = 34;
    const drawW = w - padLeft - padRight;
    const drawH = h - padTop - padBottom;
    const scale = Math.min(drawW / dx, drawH / dy);
    
    const midX_real = (minX + maxX) / 2;
    const midY_real = (minY + maxY) / 2;
    const centerCanvasX = padLeft + drawW / 2;
    const centerCanvasY = padTop + drawH / 2;
    
    const toScrX = (x) => centerCanvasX + (x - midX_real) * scale;
    const toScrY = (y) => centerCanvasY - (y - midY_real) * scale;
    
    // Subtle CAD Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridStepCm = dx > 80 ? 20 : 10;
    const startGridX = Math.floor(minX / gridStepCm) * gridStepCm;
    for (let gx = startGridX; gx <= maxX + gridStepCm; gx += gridStepCm) {
        const sx = toScrX(gx);
        ctx.beginPath();
        ctx.moveTo(sx, padTop - 10);
        ctx.lineTo(sx, h - padBottom + 10);
        ctx.stroke();
    }
    const startGridY = Math.floor(minY / gridStepCm) * gridStepCm;
    for (let gy = startGridY; gy <= maxY + gridStepCm; gy += gridStepCm) {
        const sy = toScrY(gy);
        ctx.beginPath();
        ctx.moveTo(padLeft - 10, sy);
        ctx.lineTo(w - padRight + 10, sy);
        ctx.stroke();
    }
    
    // Concrete Polygon Fill
    ctx.beginPath();
    vertices.forEach((v, i) => {
        const sx = toScrX(v[0]);
        const sy = toScrY(v[1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.fill();
    
    // Concrete 45-degree Hatching
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    for (let d = -w - h; d < w + h; d += 12) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + h, h);
        ctx.stroke();
    }
    ctx.restore();
    
    // Concrete Contour
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Centroid Axes
    const cgX = toScrX(props.centroid.x);
    const cgY = toScrY(props.centroid.y);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1;
    // Horizontal axis
    ctx.beginPath();
    ctx.moveTo(toScrX(minX) - 12, cgY);
    ctx.lineTo(toScrX(maxX) + 12, cgY);
    ctx.stroke();
    // Vertical axis
    ctx.beginPath();
    ctx.moveTo(cgX, toScrY(minY) + 12);
    ctx.lineTo(cgX, toScrY(maxY) - 12);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Centroid marker dot
    ctx.beginPath();
    ctx.arc(cgX, cgY, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#f43f5e';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    ctx.font = 'bold 9px Inter, monospace';
    ctx.fillStyle = '#fda4af';
    ctx.textAlign = 'left';
    ctx.fillText(`CG (${props.centroid.y.toFixed(1)})`, cgX + 6, cgY - 5);
    
    // Midspan Tendon Ducts
    const CABLE_PALETTE = ['#f59e0b', '#06b6d4', '#10b981', '#ec4899', '#8b5cf6'];
    if (cables && cables.length > 0) {
        cables.forEach((c, idx) => {
            const cable_path_abs = c.path.map(p => ({ ...p, y: p.y + minY / 100 }));
            const yMid_m = concreteBeamCalculator.getCablePositionAt(beam_length / 2, cable_path_abs, beam_length);
            const yMid_cm = yMid_m * 100;
            const ductX = cgX;
            const ductY = toScrY(yMid_cm);
            const col = CABLE_PALETTE[idx % CABLE_PALETTE.length];
            const ductR = Math.max(5, 3.8 * scale);
            
            // Outer duct body
            ctx.beginPath();
            ctx.arc(ductX, ductY, ductR, 0, 2 * Math.PI);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Core
            ctx.beginPath();
            ctx.arc(ductX, ductY, ductR * 0.45, 0, 2 * Math.PI);
            ctx.fillStyle = col;
            ctx.fill();
            
            // Label
            ctx.font = 'bold 9px Inter, monospace';
            ctx.fillStyle = col;
            ctx.textAlign = 'left';
            ctx.fillText(`C${idx + 1}`, ductX + ductR + 4, ductY + 3);
        });
    }
    
    // Dimension Line: Total Height h (Left)
    const dimX = padLeft - 18;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dimX, toScrY(minY));
    ctx.lineTo(dimX, toScrY(maxY));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dimX - 4, toScrY(minY)); ctx.lineTo(dimX + 4, toScrY(minY));
    ctx.moveTo(dimX - 4, toScrY(maxY)); ctx.lineTo(dimX + 4, toScrY(maxY));
    ctx.stroke();
    // Rotated text
    ctx.save();
    ctx.translate(dimX - 7, (toScrY(minY) + toScrY(maxY)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '10px Inter, monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText(`h=${props.height.toFixed(0)}cm`, 0, 0);
    ctx.restore();
    
    // Dimension Line: Top Width (Top)
    const dimYTop = padTop - 14;
    ctx.beginPath();
    ctx.moveTo(toScrX(minX), dimYTop);
    ctx.lineTo(toScrX(maxX), dimYTop);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toScrX(minX), dimYTop - 3); ctx.lineTo(toScrX(minX), dimYTop + 3);
    ctx.moveTo(toScrX(maxX), dimYTop - 3); ctx.lineTo(toScrX(maxX), dimYTop + 3);
    ctx.stroke();
    ctx.font = '10px Inter, monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText(`${dx.toFixed(0)} cm`, (toScrX(minX) + toScrX(maxX)) / 2, dimYTop - 4);
    
    // Update Section Properties Pills Container
    const pillsContainer = document.getElementById('section-props-pills');
    if (pillsContainer) {
        pillsContainer.innerHTML = `
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">ÁREA Ac</span><b class="text-sky-400 font-mono text-[11px]">${props.area.toFixed(0)} cm²</b></div>
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">ALTURA h</span><b class="text-blue-400 font-mono text-[11px]">${props.height.toFixed(0)} cm</b></div>
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">CENTROIDE yG</span><b class="text-rose-400 font-mono text-[11px]">${props.centroid.y.toFixed(1)} cm</b></div>
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">INÉRCIA Ix</span><b class="text-indigo-400 font-mono text-[11px]">${(props.I.cx / 1e4).toFixed(1)}e4 cm⁴</b></div>
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">Winf</span><b class="text-amber-400 font-mono text-[11px]">${props.W.i.toFixed(0)} cm³</b></div>
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">Wsup</span><b class="text-emerald-400 font-mono text-[11px]">${props.W.s.toFixed(0)} cm³</b></div>
        `;
    }
}

// --- CAD CANVAS RENDERING: VISTA LONGITUDINAL PANORÂMICA 2D ---

function drawLongitudinalDiagram(canvasId, inputs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 700;
    const h = rect.height || 260;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Background Dark Engineering
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#070a12');
    bgGrad.addColorStop(1, '#0c101d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    
    const props = concreteBeamCalculator.calculateSectionProperties(inputs.vertices);
    if (!props) {
        ctx.fillStyle = '#64748b';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Geometria da seção indisponível', w / 2, h / 2);
        return;
    }
    
    const L = inputs.beam_length || 20;
    const yMin = props.y_min / 100;
    const yMax = props.y_max / 100;
    const hBeam = yMax - yMin;
    
    const padX = 70;
    const padTop = 38;
    const padBottom = 54;
    const drawW = w - 2 * padX;
    const drawH = h - padTop - padBottom;
    
    const scaleX = drawW / L;
    const scaleY = Math.min(drawH / (hBeam * 1.6), scaleX * 6.5);
    
    const midY_m = (yMin + yMax) / 2;
    const toScrX = (x) => padX + x * scaleX;
    const toScrY = (y_m) => padTop + drawH / 2 - (y_m - midY_m) * scaleY;
    
    // Concrete Beam Elevation Body
    const bX0 = toScrX(0);
    const bX1 = toScrX(L);
    const bYtop = toScrY(yMax);
    const bYbot = toScrY(yMin);
    const bW = bX1 - bX0;
    const bH = bYbot - bYtop;
    
    // Concrete fill
    ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
    ctx.fillRect(bX0, bYtop, bW, bH);
    
    // Subtle concrete texture hatching
    ctx.save();
    ctx.beginPath();
    ctx.rect(bX0, bYtop, bW, bH);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let px = bX0 - bH; px < bX1 + bH; px += 24) {
        ctx.beginPath();
        ctx.moveTo(px, bYtop);
        ctx.lineTo(px + bH, bYbot);
        ctx.stroke();
    }
    ctx.restore();
    
    // Beam border
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(bX0, bYtop, bW, bH);
    
    // Centroid axis (dashed)
    const yG_m = props.centroid.y / 100;
    const scrYG = toScrY(yG_m);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.beginPath();
    ctx.moveTo(bX0, scrYG);
    ctx.lineTo(bX1, scrYG);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Structural Supports
    // Left Support (Pinned)
    const supSize = 14;
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(bX0, bYbot);
    ctx.lineTo(bX0 - supSize, bYbot + supSize * 1.3);
    ctx.lineTo(bX0 + supSize, bYbot + supSize * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Pin circle
    ctx.beginPath();
    ctx.arc(bX0, bYbot, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    // Ground hatch left
    ctx.beginPath();
    ctx.moveTo(bX0 - supSize - 4, bYbot + supSize * 1.3);
    ctx.lineTo(bX0 + supSize + 4, bYbot + supSize * 1.3);
    ctx.stroke();
    for (let hx = -supSize - 2; hx <= supSize + 2; hx += 5) {
        ctx.beginPath();
        ctx.moveTo(bX0 + hx, bYbot + supSize * 1.3);
        ctx.lineTo(bX0 + hx - 4, bYbot + supSize * 1.3 + 5);
        ctx.stroke();
    }
    
    // Right Support (Roller)
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(bX1, bYbot);
    ctx.lineTo(bX1 - supSize, bYbot + supSize);
    ctx.lineTo(bX1 + supSize, bYbot + supSize);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Roller circles
    ctx.beginPath();
    ctx.arc(bX1 - supSize / 2, bYbot + supSize + 3, 3, 0, 2 * Math.PI);
    ctx.arc(bX1 + supSize / 2, bYbot + supSize + 3, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();
    ctx.stroke();
    // Ground plate right
    const rollerBaseY = bYbot + supSize + 6;
    ctx.beginPath();
    ctx.moveTo(bX1 - supSize - 4, rollerBaseY);
    ctx.lineTo(bX1 + supSize + 4, rollerBaseY);
    ctx.stroke();
    for (let hx = -supSize - 2; hx <= supSize + 2; hx += 5) {
        ctx.beginPath();
        ctx.moveTo(bX1 + hx, rollerBaseY);
        ctx.lineTo(bX1 + hx - 4, rollerBaseY + 5);
        ctx.stroke();
    }
    
    // Parabolic Cables Profile
    const CABLE_PALETTE = ['#f59e0b', '#06b6d4', '#10b981', '#ec4899', '#8b5cf6'];
    const legendItems = [];
    
    inputs.cables.forEach((cable, idx) => {
        const col = CABLE_PALETTE[idx % CABLE_PALETTE.length];
        const cable_path_abs = cable.path.map(p => ({ ...p, y: p.y + yMin }));
        
        ctx.beginPath();
        const steps = 120;
        for (let s = 0; s <= steps; s++) {
            const x = (s / steps) * L;
            const y_m = concreteBeamCalculator.getCablePositionAt(x, cable_path_abs, L);
            const sx = toScrX(x);
            const sy = toScrY(y_m);
            if (s === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = col;
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Anchorage plates at left (x=0) and right (x=L)
        const yStart_m = concreteBeamCalculator.getCablePositionAt(0, cable_path_abs, L);
        const yEnd_m = concreteBeamCalculator.getCablePositionAt(L, cable_path_abs, L);
        const syStart = toScrY(yStart_m);
        const syEnd = toScrY(yEnd_m);
        
        // Steel Anchor Plate Left
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(bX0 - 4, syStart - 5, 4, 10);
        ctx.strokeStyle = col;
        ctx.strokeRect(bX0 - 4, syStart - 5, 4, 10);
        
        // Steel Anchor Plate Right
        ctx.fillRect(bX1, syEnd - 5, 4, 10);
        ctx.strokeRect(bX1, syEnd - 5, 4, 10);
        
        // Prestress Force Vectors P0
        const arrowLen = 22;
        // Left arrow pointing into beam
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bX0 - arrowLen, syStart);
        ctx.lineTo(bX0 - 5, syStart);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bX0 - 5, syStart);
        ctx.lineTo(bX0 - 9, syStart - 3);
        ctx.lineTo(bX0 - 9, syStart + 3);
        ctx.closePath();
        ctx.fill();
        
        // Right arrow pointing into beam
        ctx.beginPath();
        ctx.moveTo(bX1 + arrowLen, syEnd);
        ctx.lineTo(bX1 + 5, syEnd);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bX1 + 5, syEnd);
        ctx.lineTo(bX1 + 9, syEnd - 3);
        ctx.lineTo(bX1 + 9, syEnd + 3);
        ctx.closePath();
        ctx.fill();
        
        // Midspan control node
        const yMid_m = concreteBeamCalculator.getCablePositionAt(L / 2, cable_path_abs, L);
        const sxMid = toScrX(L / 2);
        const syMid = toScrY(yMid_m);
        
        ctx.beginPath();
        ctx.arc(sxMid, syMid, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        
        legendItems.push(`
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-sm" style="color: ${col}; border-color: ${col}44; background: ${col}15;">
                <span class="w-2 h-2 rounded-full" style="background: ${col}"></span>
                Cabo ${idx + 1} (${cable.num_strands} cord. - t₀=${cable.age_at_prestress}d)
            </span>
        `);
    });
    
    // Labels P0
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'right';
    ctx.fillText('P₀', bX0 - 24, bYtop + bH / 2 + 3);
    ctx.textAlign = 'left';
    ctx.fillText('P₀', bX1 + 24, bYtop + bH / 2 + 3);
    
    // Span Dimension Line (Bottom)
    const dimY = bYbot + supSize + 18;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bX0, dimY);
    ctx.lineTo(bX1, dimY);
    ctx.stroke();
    // Dimension ticks
    ctx.beginPath();
    ctx.moveTo(bX0, dimY - 4); ctx.lineTo(bX0, dimY + 4);
    ctx.moveTo(bX1, dimY - 4); ctx.lineTo(bX1, dimY + 4);
    ctx.stroke();
    ctx.font = 'bold 11px Inter, monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.fillText(`Vão L = ${L.toFixed(1)} m`, (bX0 + bX1) / 2, dimY + 14);
    
    // Update Longitudinal Cables Legend Container
    const legendContainer = document.getElementById('longitudinal-cables-legend');
    if (legendContainer) {
        legendContainer.innerHTML = legendItems.join('');
    }
}'''

# Replace from `// --- HELPER FUNCTIONS FOR UI ---` down to `function drawLongitudinalDiagram(...) { ... }`
old_ui_cad_pat = r"// --- HELPER FUNCTIONS FOR UI ---.*?function drawLongitudinalDiagram\(canvasId, inputs\) \{.*?\n\}"
assert re.search(old_ui_cad_pat, code, re.DOTALL) is not None, "old UI and CAD section not found"
code = re.sub(old_ui_cad_pat, new_ui_and_cad, code, flags=re.DOTALL)

# 3. Update DOMContentLoaded initialization
new_init = '''// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {

    if (typeof initializeSharedUI === 'function') initializeSharedUI();

    // Initialize with default preset (viga_i_ponte)
    if (typeof window.loadPrestressedPreset === 'function') {
        window.loadPrestressedPreset('viga_i_ponte', false);
    } else {
        addCableGroup('cables-list-container');
    }

    document.getElementById('add-cable-group-btn').addEventListener('click', () => addCableGroup('cables-list-container'));

    // Save/Load Listeners
    document.getElementById('save-inputs-btn').addEventListener('click', handleCustomSave);
    document.getElementById('load-inputs-btn').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', handleCustomLoad);

    const gatherAllInputs = () => {
        const inputs = inputManager.inputIds.reduce((acc, id) => {
            const el = document.getElementById(id);
            if (el) acc[id] = (el.type === 'number') ? parseFloat(el.value) || 0 : el.value;
            return acc;
        }, {});
        inputs.vertices = inputManager._parseVertices(document.getElementById('beam_coords')?.value);
        inputs.cables = inputManager._gatherCables();
        return inputs;
    };

    const drawAll = debounce(() => {
        const inputs = gatherAllInputs();
        drawCrossSectionDiagram('cross-section-canvas', inputs);
        drawLongitudinalDiagram('longitudinal-canvas', inputs);
    }, 150);

    window.addEventListener('input', drawAll);
    window.addEventListener('resize', debounce(drawAll, 200));

    document.getElementById('run-check-btn').addEventListener('click', async () => {
        const inputs = gatherAllInputs();
        let res;
        try {
             if (window.eel && window.eel.calculate_prestressed_beam_check) {
                 res = await window.eel.calculate_prestressed_beam_check(inputs)();
                 if(res.errors && res.errors.length > 0) {
                     alert("Erro no cálculo: " + res.errors.join("\\n"));
                     return;
                 }
             } else {
                 console.warn("Backend not available, using local.");
                 res = concreteBeamCalculator.run(inputs);
             }
        } catch(e) {
            console.error("Backend failed, using local fallback", e);
             res = concreteBeamCalculator.run(inputs);
        }
        renderResults(res);
    });

    drawAll();
});'''

old_init_pat = r"// --- INITIALIZATION ---.*?document\.addEventListener\('DOMContentLoaded', \(\) => \{.*?\n\}\);"
assert re.search(old_init_pat, code, re.DOTALL) is not None, "old init section not found"
code = re.sub(old_init_pat, new_init, code, flags=re.DOTALL)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("viga_protendida.js updated successfully!")
