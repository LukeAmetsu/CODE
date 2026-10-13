import sys

with open('gui/capacidade_estaca.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = -1
end = -1
for i, l in enumerate(lines):
    if '<!-- Quick Factors' in l:
        start = i
    if '<!-- 2-Column Grid' in l:
        end = i

assert start != -1 and end != -1, f"Indices not found: start={start}, end={end}"

new_block = """                <!-- Quick Factors & Design Parameters Dashboard -->
                <div class="p-3.5 rounded-2xl border border-gray-200/90 dark:border-gray-700/80 bg-white/95 dark:bg-gray-800/95 shadow-xs space-y-3">
                    
                    <!-- Header Bar: Title, Presets & Primary Action -->
                    <div class="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-gray-100 dark:border-gray-700/70">
                        <div class="flex items-center gap-2">
                            <span class="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-black text-xs shadow-2xs">
                                ⚡
                            </span>
                            <span class="text-xs font-black uppercase tracking-wider text-gray-800 dark:text-gray-200">
                                Controles Rápidos de Dimensionamento
                            </span>
                        </div>

                        <!-- Presets and Recalculate Button -->
                        <div class="flex items-center gap-2 flex-wrap">
                            <button type="button" onclick="applyHaskoningPreset()" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/70 hover:dark:bg-violet-900/80 text-violet-800 dark:text-violet-200 border border-violet-200 dark:border-violet-800 shadow-2xs transition-all flex items-center gap-1" title="Aplica os 5 critérios da Haskoning: FS=2.8, Cargas de serviço por eixo, qs <= 0.19 MPa, qp sem limite, beta relativo ao topo">
                                <span>🎯</span> Haskoning (FS=2.8)
                            </button>
                            <button type="button" onclick="applyStandardPreset()" class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/70 hover:dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 shadow-2xs transition-all flex items-center gap-1" title="Restaura os parâmetros normativos padrão FHWA / AASHTO">
                                <span>⚖️</span> Padrão FHWA
                            </button>
                            <button type="button" onclick="triggerCalculation()" class="px-3.5 py-1 text-xs font-bold rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-xs hover:shadow transition-all flex items-center gap-1 whitespace-nowrap active:scale-95">
                                <span>⚡</span> Recalcular
                            </button>
                        </div>
                    </div>

                    <!-- 3-Column Structured Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                        
                        <!-- CARD 1: Carga Alvo & Camisa Metálica -->
                        <div class="p-2.5 rounded-xl bg-gray-50/70 dark:bg-gray-750/40 border border-gray-200/70 dark:border-gray-700/60 space-y-2">
                            <span class="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                <span>🎯</span> Carga Alvo & Camisa
                            </span>

                            <!-- Target Load -->
                            <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 shadow-2xs">
                                <span class="text-[11px] font-bold text-gray-700 dark:text-gray-300">Carga Alvo (R<sub>adm</sub>):</span>
                                <div class="flex items-center gap-1">
                                    <input type="text" id="quick-input-target-load" step="100" min="100" value="21400" onchange="syncTargetLoad(this.value)" class="w-24 px-1.5 py-0.5 text-xs text-center font-black rounded border border-blue-300 dark:border-blue-600 bg-blue-50/40 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 focus:ring-1 focus:ring-blue-500 shadow-2xs" title="Carga Admissível de Projeto Radm (kN)">
                                    <span class="text-[11px] font-bold text-gray-400">kN</span>
                                </div>
                            </div>

                            <!-- Steel Casing Group -->
                            <div class="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 shadow-2xs space-y-1.5">
                                <div class="flex items-center justify-between text-[10px]">
                                    <span class="font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                                        <span>🔩</span> Camisa Metálica:
                                    </span>
                                    <span id="quick-casing-factor-badge" class="text-[9px] font-black text-rose-700 dark:text-rose-300 px-1 py-0.2 rounded bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50">(x0.90)</span>
                                </div>
                                <div class="grid grid-cols-2 gap-1.5 text-xs">
                                    <div class="flex items-center justify-between gap-1 bg-gray-50 dark:bg-gray-700/40 px-1.5 py-0.5 rounded border border-gray-200/60 dark:border-gray-600/60">
                                        <span class="text-[10px] font-semibold text-gray-500 dark:text-gray-400">Redução:</span>
                                        <div class="flex items-center gap-0.5">
                                            <input type="text" id="quick-input-casing-pct" step="1" min="0" max="50" value="10" onchange="syncCasingPct(this.value)" class="w-10 px-1 py-0.5 text-xs text-center font-bold rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-rose-600 dark:text-rose-400 focus:ring-1 focus:ring-rose-500">
                                            <span class="text-[10px] font-bold text-gray-400">%</span>
                                        </div>
                                    </div>
                                    <div class="flex items-center justify-between gap-1 bg-gray-50 dark:bg-gray-700/40 px-1.5 py-0.5 rounded border border-gray-200/60 dark:border-gray-600/60">
                                        <span class="text-[10px] font-semibold text-gray-500 dark:text-gray-400" title="Comprimento com camisa a partir do topo (em branco = estaca inteira)">Comp.:</span>
                                        <div class="flex items-center gap-0.5">
                                            <input type="text" id="quick-input-casing-len" step="0.5" min="0" max="150" placeholder="Total" onchange="syncCasingLength(this.value)" class="w-12 px-1 py-0.5 text-xs text-center font-bold rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-rose-600 dark:text-rose-400 focus:ring-1 focus:ring-rose-500">
                                            <span class="text-[10px] font-bold text-gray-400">m</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex items-center justify-between gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-700/50">
                                    <span class="text-[10px] font-semibold text-gray-500 dark:text-gray-400">Modo:</span>
                                    <select id="quick-select-casing-mode" onchange="syncCasingMode(this.value)" class="flex-grow px-1.5 py-0.5 text-[10px] font-medium rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-rose-500">
                                        <option value="excel_formula">Capacidade Total (Radm × fator)</option>
                                        <option value="lateral_only">Apenas Atrito Lateral (Rs × fator)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- CARD 2: Fatores de Segurança & Diâmetros -->
                        <div class="p-2.5 rounded-xl bg-gray-50/70 dark:bg-gray-750/40 border border-gray-200/70 dark:border-gray-700/60 space-y-2">
                            <span class="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                <span>🛡️</span> Fatores de Segurança & Diâmetros
                            </span>

                            <!-- Safety Factors Row -->
                            <div class="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 shadow-2xs space-y-1">
                                <span class="text-[9px] font-bold uppercase tracking-wider text-gray-400 block">Fatores de Segurança (FS)</span>
                                <div class="grid grid-cols-3 gap-1.5">
                                    <div class="flex flex-col items-center p-1 rounded bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50">
                                        <span class="text-[9px] font-bold text-emerald-700 dark:text-emerald-300">Global</span>
                                        <input type="text" id="quick-input-fs" step="0.1" min="1.0" max="4.0" value="2.0" onchange="syncFSGlobal(this.value)" class="w-full mt-0.5 px-0.5 py-0.5 text-xs text-center font-black rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 focus:ring-1 focus:ring-emerald-500">
                                    </div>
                                    <div class="flex flex-col items-center p-1 rounded bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/50">
                                        <span class="text-[9px] font-bold text-blue-700 dark:text-blue-300">Lateral (s)</span>
                                        <input type="text" id="quick-input-fs-s" step="0.1" min="1.0" max="4.0" value="1.5" onchange="syncFSLateral(this.value)" class="w-full mt-0.5 px-0.5 py-0.5 text-xs text-center font-black rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 focus:ring-1 focus:ring-blue-500">
                                    </div>
                                    <div class="flex flex-col items-center p-1 rounded bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-800/50">
                                        <span class="text-[9px] font-bold text-purple-700 dark:text-purple-300">Ponta (p)</span>
                                        <input type="text" id="quick-input-fs-p" step="0.1" min="1.0" max="5.0" value="3.0" onchange="syncFSPonta(this.value)" class="w-full mt-0.5 px-0.5 py-0.5 text-xs text-center font-black rounded border border-purple-300 dark:border-purple-700 bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 focus:ring-1 focus:ring-purple-500">
                                    </div>
                                </div>
                            </div>

                            <!-- Diameters Row -->
                            <div class="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 shadow-2xs space-y-1">
                                <span class="text-[9px] font-bold uppercase tracking-wider text-gray-400 block">Diâmetros das Estacas (m)</span>
                                <div class="grid grid-cols-3 gap-1.5">
                                    <div class="flex items-center justify-between gap-1 p-1 rounded bg-gray-50 dark:bg-gray-700/40 border border-gray-200/60 dark:border-gray-600/60">
                                        <span class="text-[10px] font-black text-blue-600 dark:text-blue-400">D₁</span>
                                        <input type="text" id="quick-input-diam-0" step="0.05" min="0.4" max="3.0" value="1.20" onchange="syncPileDiameter(0, this.value)" class="w-11 px-1 py-0.5 text-xs text-center font-bold rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                    </div>
                                    <div class="flex items-center justify-between gap-1 p-1 rounded bg-gray-50 dark:bg-gray-700/40 border border-gray-200/60 dark:border-gray-600/60">
                                        <span class="text-[10px] font-black text-blue-600 dark:text-blue-400">D₂</span>
                                        <input type="text" id="quick-input-diam-1" step="0.05" min="0.4" max="3.0" value="1.30" onchange="syncPileDiameter(1, this.value)" class="w-11 px-1 py-0.5 text-xs text-center font-bold rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                    </div>
                                    <div class="flex items-center justify-between gap-1 p-1 rounded bg-gray-50 dark:bg-gray-700/40 border border-gray-200/60 dark:border-gray-600/60">
                                        <span class="text-[10px] font-black text-blue-600 dark:text-blue-400">D₃</span>
                                        <input type="text" id="quick-input-diam-2" step="0.05" min="0.4" max="3.0" value="1.50" onchange="syncPileDiameter(2, this.value)" class="w-11 px-1 py-0.5 text-xs text-center font-bold rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- CARD 3: Normas & Travas de Cálculo -->
                        <div class="p-2.5 rounded-xl bg-gray-50/70 dark:bg-gray-750/40 border border-gray-200/70 dark:border-gray-700/60 space-y-2">
                            <span class="text-[10px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-300 flex items-center gap-1">
                                <span>🔒</span> Normas & Travas
                            </span>

                            <!-- Methods Selection -->
                            <div class="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 shadow-2xs space-y-1">
                                <div class="grid grid-cols-2 gap-1.5 text-xs">
                                    <div class="space-y-0.5">
                                        <span class="text-[9px] font-bold text-gray-400 block">Atrito Lateral (q<sub>s</sub>)</span>
                                        <select id="quick-select-lateral-method" onchange="syncLateralMethod(this.value)" class="w-full px-1.5 py-0.5 text-[10px] font-semibold rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-indigo-700 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500">
                                            <option value="mayne_fhwa">FHWA (Mayne)</option>
                                            <option value="aashto_2007">AASHTO 2007 (≤4 ksf)</option>
                                        </select>
                                    </div>
                                    <div class="space-y-0.5">
                                        <span class="text-[9px] font-bold text-gray-400 block">Ponta (q<sub>p</sub>)</span>
                                        <select id="quick-select-tip-method" onchange="syncTipMethod(this.value)" class="w-full px-1.5 py-0.5 text-[10px] font-semibold rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-indigo-700 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500">
                                            <option value="aashto_2007">AASHTO 2007 (kp·N)</option>
                                            <option value="aashto_2024">AASHTO 2024 (1.2N ≤ 60 ksf)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- Checkbox Constraints Toggles -->
                            <div class="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 shadow-2xs space-y-1">
                                <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                                    <label class="flex items-center gap-1 cursor-pointer text-gray-700 dark:text-gray-300" title="Travar qs maximo em 4.0 ksf (0.19 MPa / 191.5 kPa) - AASHTO 2017">
                                        <input type="checkbox" id="quick-check-apply-qs-cap" checked onchange="syncApplyQsCap(this.checked)" class="w-3.5 h-3.5 rounded text-violet-600 focus:ring-violet-500">
                                        <span class="font-semibold truncate">Trava q<sub>s</sub> (0.19 MPa)</span>
                                    </label>
                                    <label class="flex items-center gap-1 cursor-pointer text-gray-700 dark:text-gray-300" title="Travar qp maximo em 60 ksf (2.87 MPa). Desmarcar deixa sem limite (Haskoning)">
                                        <input type="checkbox" id="quick-check-apply-qp-cap" checked onchange="syncApplyQpCap(this.checked)" class="w-3.5 h-3.5 rounded text-violet-600 focus:ring-violet-500">
                                        <span class="font-semibold truncate">Trava q<sub>p</sub> (60 ksf)</span>
                                    </label>
                                    <label class="flex items-center gap-1 cursor-pointer text-gray-700 dark:text-gray-300" title="Norma nova FHWA GEC 010: Trava beta <= Kp * tan(phi')">
                                        <input type="checkbox" id="quick-check-beta-cap-kp" checked onchange="syncBetaCapKp(this.checked)" class="w-3.5 h-3.5 rounded text-violet-600 focus:ring-violet-500">
                                        <span class="font-semibold truncate">Trava K<sub>p</sub>·tan(&phi;')</span>
                                    </label>
                                    <label class="flex items-center gap-1 cursor-pointer text-gray-700 dark:text-gray-300" title="Norma nova FHWA: Tensão mínima de 43.1 kPa nas camadas rasas">
                                        <input type="checkbox" id="quick-check-shallow-stress" checked onchange="syncShallowStressLimit(this.checked)" class="w-3.5 h-3.5 rounded text-violet-600 focus:ring-violet-500">
                                        <span class="font-semibold truncate">&sigma;'<sub>v</sub> raso &ge; 43 kPa</span>
                                    </label>
                                </div>
                                
                                <!-- Beta Limits Row -->
                                <div class="pt-1 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between gap-1 text-[10px]">
                                    <label class="flex items-center gap-1 cursor-pointer text-gray-700 dark:text-gray-300" title="Ativar/desativar com um clique a trava numérica de valores de beta">
                                        <input type="checkbox" id="quick-check-apply-beta-limits" checked onchange="syncApplyBetaLimits(this.checked)" class="w-3.5 h-3.5 rounded text-violet-600 focus:ring-violet-500">
                                        <span class="font-bold">Trava &beta;:</span>
                                    </label>
                                    <div class="flex items-center gap-1">
                                        <input type="text" id="quick-input-beta-min" step="0.05" min="0.05" max="1.0" value="0.25" onchange="syncBetaMin(this.value)" class="w-11 px-1 py-0.5 text-[10px] text-center font-bold rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-violet-700 dark:text-violet-300" title="Limite inferior de beta">
                                        <span class="text-gray-400 font-bold">-</span>
                                        <input type="text" id="quick-input-beta-max" step="0.1" min="0.5" max="3.0" value="1.8" onchange="syncBetaMax(this.value)" class="w-11 px-1 py-0.5 text-[10px] text-center font-bold rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-violet-700 dark:text-violet-300" title="Limite superior de beta">
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- Bottom Strip: Net Capacity (Peso Próprio Submerso) -->
                    <div class="p-2 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div class="flex items-center gap-1.5">
                            <span class="text-amber-600 dark:text-amber-400">⚖️</span>
                            <label class="flex items-center gap-1.5 cursor-pointer font-bold text-gray-800 dark:text-gray-200" title="Descontar peso próprio submerso efetivo da estaca: Radm,net = Radm - Wpile">
                                <input type="checkbox" id="quick-check-pile-weight" onchange="syncPileWeight(this.checked)" class="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500">
                                <span class="text-[11px]">Descontar Peso Próprio da Estaca (R<sub>adm,net</sub> = R<sub>adm</sub> - W<sub>estaca</sub>)</span>
                            </label>
                        </div>

                        <div class="flex items-center gap-2.5 flex-wrap">
                            <div class="flex items-center gap-1">
                                <span class="text-[10px] font-semibold text-gray-600 dark:text-gray-400">&gamma;'<sub>concreto</sub>:</span>
                                <input type="text" id="quick-input-gamma-sub-conc" step="0.5" min="1" max="25" value="14.0" onchange="syncConcreteGammaSub(this.value)" class="w-12 px-1 py-0.5 text-xs text-center font-bold rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-300 focus:ring-1 focus:ring-amber-500" title="Peso específico submerso do concreto (kN/m³)">
                                <span class="text-[10px] text-gray-400">kN/m³</span>
                            </div>
                            <div class="h-3 w-px bg-amber-300/60 dark:bg-amber-700/60"></div>
                            <div class="flex items-center gap-1">
                                <span class="text-[10px] font-semibold text-gray-600 dark:text-gray-400" title="Comprimento da estaca acima da cota de início (m)">L<sub>topo</sub>:</span>
                                <input type="text" id="quick-input-pile-len-above" step="0.5" min="0" max="150" value="0.0" onchange="syncPileLengthAboveStart(this.value)" class="w-12 px-1 py-0.5 text-xs text-center font-bold rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-300 focus:ring-1 focus:ring-amber-500" title="Comprimento da estaca acima da profundidade de início (m)">
                                <span class="text-[10px] text-gray-400">m</span>
                            </div>
                            <span id="quick-pile-weight-preview" class="text-[10px] font-black text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-800" title="Peso efetivo estimado para estaca D=1.50m em 45m de profundidade">~1,113 kN (45m)</span>
                        </div>
                    </div>

                </div>
"""

new_lines = lines[:start] + [new_block] + lines[end-1:]

with open('gui/capacidade_estaca.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Successfully updated with clean HTML characters!")
