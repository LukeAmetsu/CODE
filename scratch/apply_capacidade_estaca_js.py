import sys

with open('gui/capacidade_estaca.js', 'r', encoding='utf-8') as f:
    content = f.read()

is_crlf = '\r\n' in content
normalized = content.replace('\r\n', '\n')

# 1. Add parseMath helper and ensure enableMathInInputs is called on DOMContentLoaded
target_init = """// Inicialização
document.addEventListener("DOMContentLoaded", () => {
    loadReferenceData();
});"""

replacement_init = """// Helper para conversão de valores matemáticos e equações
function parseMath(val, fallback = 0) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "number") return isFinite(val) ? val : fallback;
    const str = String(val).trim();
    if (str === "") return fallback;
    if (typeof safeMathEval === "function") {
        const res = safeMathEval(str);
        if (res !== null && isFinite(res)) return res;
    } else if (typeof window !== "undefined" && typeof window.safeMathEval === "function") {
        const res = window.safeMathEval(str);
        if (res !== null && isFinite(res)) return res;
    }
    const num = parseFloat(str.replace(",", "."));
    return (!isNaN(num) && isFinite(num)) ? num : fallback;
}

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
    if (typeof enableMathInInputs === "function") enableMathInInputs();
    loadReferenceData();
});"""

# 2. Update syncConcreteGamma, syncWaterGamma, syncConcreteGammaSub, syncPileLengthAboveStart
target_sync_concrete = """function syncConcreteGamma(val) {
    const num = Math.max(10, Math.min(40, parseFloat(val) || 24.0));
    projectData.concrete_unit_weight = num;
    const elParam = document.getElementById("input-concrete-unit-weight");
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;

    const gammaW = projectData.water_unit_weight ?? 10.0;
    const gammaSub = Math.max(0, num - gammaW);
    const elQuickSub = document.getElementById("quick-input-gamma-sub-conc");
    const badgeSub = document.getElementById("badge-gamma-sub-conc");
    if (elQuickSub) elQuickSub.value = gammaSub.toFixed(1);
    if (badgeSub) badgeSub.innerText = `${gammaSub.toFixed(1)} kN/m³`;

    updatePileWeightPreview();
    triggerCalculation();
}

function syncWaterGamma(val) {
    const num = Math.max(5, Math.min(15, parseFloat(val) || 10.0));
    projectData.water_unit_weight = num;
    const elParam = document.getElementById("input-water-unit-weight");
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;

    const gammaC = projectData.concrete_unit_weight ?? 24.0;
    const gammaSub = Math.max(0, gammaC - num);
    const elQuickSub = document.getElementById("quick-input-gamma-sub-conc");
    const badgeSub = document.getElementById("badge-gamma-sub-conc");
    if (elQuickSub) elQuickSub.value = gammaSub.toFixed(1);
    if (badgeSub) badgeSub.innerText = `${gammaSub.toFixed(1)} kN/m³`;

    updatePileWeightPreview();
    triggerCalculation();
}

function syncConcreteGammaSub(val) {
    const num = Math.max(0, Math.min(30, parseFloat(val) || 14.0));
    const gammaW = projectData.water_unit_weight ?? 10.0;
    projectData.concrete_unit_weight = num + gammaW;

    const elParamC = document.getElementById("input-concrete-unit-weight");
    const badgeSub = document.getElementById("badge-gamma-sub-conc");
    if (elParamC) elParamC.value = (num + gammaW).toFixed(1);
    if (badgeSub) badgeSub.innerText = `${num.toFixed(1)} kN/m³`;

    updatePileWeightPreview();
    triggerCalculation();
}

function syncPileWeightMode(val) {
    projectData.pile_weight_mode = val;
    const elParam = document.getElementById("select-pile-weight-mode");
    if (elParam && elParam.value !== val) elParam.value = val;
    triggerCalculation();
}

function syncPileLengthAboveStart(val) {
    const num = Math.max(0, parseFloat(val) || 0.0);
    projectData.pile_length_above_start_m = num;
    const elQuick = document.getElementById("quick-input-pile-len-above");
    const elParam = document.getElementById("input-pile-length-above-start");
    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num.toFixed(1);
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num.toFixed(1);
    saveProjectState();
    triggerCalculation();
}"""

replacement_sync_concrete = """function syncConcreteGamma(val) {
    const num = Math.max(10, Math.min(40, parseMath(val, 24.0)));
    projectData.concrete_unit_weight = num;
    const elParam = document.getElementById("input-concrete-unit-weight");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;

    const gammaW = projectData.water_unit_weight ?? 10.0;
    const gammaSub = Math.max(0, num - gammaW);
    const elQuickSub = document.getElementById("quick-input-gamma-sub-conc");
    const badgeSub = document.getElementById("badge-gamma-sub-conc");
    if (elQuickSub) elQuickSub.value = gammaSub.toFixed(1);
    if (badgeSub) badgeSub.innerText = `${gammaSub.toFixed(1)} kN/m³`;

    updatePileWeightPreview();
    triggerCalculation();
}

function syncWaterGamma(val) {
    const num = Math.max(5, Math.min(15, parseMath(val, 10.0)));
    projectData.water_unit_weight = num;
    const elParam = document.getElementById("input-water-unit-weight");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;

    const gammaC = projectData.concrete_unit_weight ?? 24.0;
    const gammaSub = Math.max(0, gammaC - num);
    const elQuickSub = document.getElementById("quick-input-gamma-sub-conc");
    const badgeSub = document.getElementById("badge-gamma-sub-conc");
    if (elQuickSub) elQuickSub.value = gammaSub.toFixed(1);
    if (badgeSub) badgeSub.innerText = `${gammaSub.toFixed(1)} kN/m³`;

    updatePileWeightPreview();
    triggerCalculation();
}

function syncConcreteGammaSub(val) {
    const num = Math.max(0, Math.min(30, parseMath(val, 14.0)));
    const gammaW = projectData.water_unit_weight ?? 10.0;
    projectData.concrete_unit_weight = num + gammaW;

    const elParamC = document.getElementById("input-concrete-unit-weight");
    const badgeSub = document.getElementById("badge-gamma-sub-conc");
    if (elParamC) elParamC.value = (num + gammaW).toFixed(1);
    if (badgeSub) badgeSub.innerText = `${num.toFixed(1)} kN/m³`;

    updatePileWeightPreview();
    triggerCalculation();
}

function syncPileWeightMode(val) {
    projectData.pile_weight_mode = val;
    const elParam = document.getElementById("select-pile-weight-mode");
    if (elParam && elParam.value !== val) elParam.value = val;
    triggerCalculation();
}

function syncPileLengthAboveStart(val) {
    const num = Math.max(0, parseMath(val, 0.0));
    projectData.pile_length_above_start_m = num;
    const elQuick = document.getElementById("quick-input-pile-len-above");
    const elParam = document.getElementById("input-pile-length-above-start");
    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num.toFixed(1);
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num.toFixed(1);
    saveProjectState();
    triggerCalculation();
}"""

# 3. Update syncCasingPct, syncCasingLength, syncFSGlobal, syncFSLateral, syncFSPonta
target_sync_casing_fs = """function syncCasingPct(val) {
    const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
    projectData.casing_reduction_pct = num;
    const factor = 1.0 - (num / 100.0);
    const factorStr = factor.toFixed(2);

    const elQuick = document.getElementById("quick-input-casing-pct");
    const elParam = document.getElementById("input-casing-reduction");
    const elBadge = document.getElementById("quick-casing-factor-badge");
    const elKpiRed = document.getElementById("kpi-casing-reduction");
    const elKpiFactor = document.getElementById("kpi-casing-factor");

    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elBadge) elBadge.innerText = `(x${factorStr})`;
    if (elKpiRed) elKpiRed.innerText = `-${num}%`;
    if (elKpiFactor) elKpiFactor.innerText = `(x${factorStr})`;

    updateKPIs();
    triggerCalculation();
}

function syncCasingLength(val) {
    const raw = (typeof val === "string") ? val.trim() : val;
    let num = null;
    if (raw !== "" && raw !== null && raw !== undefined) {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed >= 0) {
            num = parsed;
        }
    }
    projectData.casing_length_m = num;

    const elQuick = document.getElementById("quick-input-casing-len");
    const elParam = document.getElementById("input-casing-length");

    if (elQuick && (num === null ? elQuick.value !== "" : parseFloat(elQuick.value) !== num)) {
        elQuick.value = (num === null) ? "" : num;
    }
    if (elParam && (num === null ? elParam.value !== "" : parseFloat(elParam.value) !== num)) {
        elParam.value = (num === null) ? "" : num;
    }

    updateKPIs();
    triggerCalculation();
}

function syncCasingMode(val) {
    projectData.casing_reduction_mode = val;
    const elQuick = document.getElementById("quick-select-casing-mode");
    const elParam = document.getElementById("select-casing-mode");
    if (elQuick && elQuick.value !== val) elQuick.value = val;
    if (elParam && elParam.value !== val) elParam.value = val;
    triggerCalculation();
}

function syncFSGlobal(val) {
    const num = Math.max(0.1, parseFloat(val) || 2.0);
    projectData.fs = num;
    projectData.fs_global = num;
    const elQuick = document.getElementById("quick-input-fs");
    const elParam = document.getElementById("input-fs");
    const elKpi = document.getElementById("kpi-fs");

    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(2);
    triggerCalculation();
}

function syncFS(val) {
    syncFSGlobal(val);
}

function syncFSLateral(val) {
    const num = Math.max(0.1, parseFloat(val) || 1.5);
    projectData.fs_lateral = num;
    const elQuick = document.getElementById("quick-input-fs-s");
    const elParam = document.getElementById("input-fs-lateral");
    const elKpi = document.getElementById("kpi-fs-dif-s");

    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(1);
    triggerCalculation();
}

function syncFSPonta(val) {
    const num = Math.max(0.1, parseFloat(val) || 3.0);
    projectData.fs_ponta = num;
    const elQuick = document.getElementById("quick-input-fs-p");
    const elParam = document.getElementById("input-fs-ponta");
    const elKpi = document.getElementById("kpi-fs-dif-p");

    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(1);
    triggerCalculation();
}"""

replacement_sync_casing_fs = """function syncCasingPct(val) {
    const num = Math.max(0, Math.min(100, parseMath(val, 0)));
    projectData.casing_reduction_pct = num;
    const factor = 1.0 - (num / 100.0);
    const factorStr = factor.toFixed(2);

    const elQuick = document.getElementById("quick-input-casing-pct");
    const elParam = document.getElementById("input-casing-reduction");
    const elBadge = document.getElementById("quick-casing-factor-badge");
    const elKpiRed = document.getElementById("kpi-casing-reduction");
    const elKpiFactor = document.getElementById("kpi-casing-factor");

    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elBadge) elBadge.innerText = `(x${factorStr})`;
    if (elKpiRed) elKpiRed.innerText = `-${num}%`;
    if (elKpiFactor) elKpiFactor.innerText = `(x${factorStr})`;

    updateKPIs();
    triggerCalculation();
}

function syncCasingLength(val) {
    const raw = (typeof val === "string") ? val.trim() : val;
    let num = null;
    if (raw !== "" && raw !== null && raw !== undefined) {
        const parsed = parseMath(raw, NaN);
        if (!isNaN(parsed) && parsed >= 0) {
            num = parsed;
        }
    }
    projectData.casing_length_m = num;

    const elQuick = document.getElementById("quick-input-casing-len");
    const elParam = document.getElementById("input-casing-length");

    if (elQuick && (num === null ? elQuick.value !== "" : parseMath(elQuick.value) !== num)) {
        elQuick.value = (num === null) ? "" : num;
    }
    if (elParam && (num === null ? elParam.value !== "" : parseMath(elParam.value) !== num)) {
        elParam.value = (num === null) ? "" : num;
    }

    updateKPIs();
    triggerCalculation();
}

function syncCasingMode(val) {
    projectData.casing_reduction_mode = val;
    const elQuick = document.getElementById("quick-select-casing-mode");
    const elParam = document.getElementById("select-casing-mode");
    if (elQuick && elQuick.value !== val) elQuick.value = val;
    if (elParam && elParam.value !== val) elParam.value = val;
    triggerCalculation();
}

function syncFSGlobal(val) {
    const num = Math.max(0.1, parseMath(val, 2.0));
    projectData.fs = num;
    projectData.fs_global = num;
    const elQuick = document.getElementById("quick-input-fs");
    const elParam = document.getElementById("input-fs");
    const elKpi = document.getElementById("kpi-fs");

    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(2);
    triggerCalculation();
}

function syncFS(val) {
    syncFSGlobal(val);
}

function syncFSLateral(val) {
    const num = Math.max(0.1, parseMath(val, 1.5));
    projectData.fs_lateral = num;
    const elQuick = document.getElementById("quick-input-fs-s");
    const elParam = document.getElementById("input-fs-lateral");
    const elKpi = document.getElementById("kpi-fs-dif-s");

    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(1);
    triggerCalculation();
}

function syncFSPonta(val) {
    const num = Math.max(0.1, parseMath(val, 3.0));
    projectData.fs_ponta = num;
    const elQuick = document.getElementById("quick-input-fs-p");
    const elParam = document.getElementById("input-fs-ponta");
    const elKpi = document.getElementById("kpi-fs-dif-p");

    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(1);
    triggerCalculation();
}"""

# 4. Update syncQsMax, syncQpMax, syncBetaMin, syncBetaMax
target_sync_qs_beta = """function syncQsMax(val) {
    const num = Math.max(0.1, parseFloat(val) || 4.0);
    projectData.qs_max_ksf = num;
    const elParam = document.getElementById("input-qs-max-ksf");
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    triggerCalculation();
}

function syncQpMax(val) {
    const num = Math.max(1.0, parseFloat(val) || 60.0);
    projectData.qp_max_ksf = num;
    const elParam = document.getElementById("input-qp-max-ksf");
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    triggerCalculation();
}

function syncBetaMin(val) {
    const num = Math.max(0.01, parseFloat(val) || 0.25);
    projectData.beta_min = num;
    const elParam = document.getElementById("input-beta-min");
    const elQuick = document.getElementById("quick-input-beta-min");
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;

    saveProjectState();
    triggerCalculation();
    showToast(`Limite inferior de β ajustado para ${num.toFixed(2)}.`, "info");
}

function syncBetaMax(val) {
    const num = Math.max(0.1, parseFloat(val) || 1.8);
    projectData.beta_max = num;
    const elParam = document.getElementById("input-beta-max");
    const elQuick = document.getElementById("quick-input-beta-max");
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;

    saveProjectState();
    triggerCalculation();
    showToast(`Limite superior de β ajustado para ${num.toFixed(2)} (AASHTO 2017).`, "info");
}"""

replacement_sync_qs_beta = """function syncQsMax(val) {
    const num = Math.max(0.1, parseMath(val, 4.0));
    projectData.qs_max_ksf = num;
    const elParam = document.getElementById("input-qs-max-ksf");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    triggerCalculation();
}

function syncQpMax(val) {
    const num = Math.max(1.0, parseMath(val, 60.0));
    projectData.qp_max_ksf = num;
    const elParam = document.getElementById("input-qp-max-ksf");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    triggerCalculation();
}

function syncBetaMin(val) {
    const num = Math.max(0.01, parseMath(val, 0.25));
    projectData.beta_min = num;
    const elParam = document.getElementById("input-beta-min");
    const elQuick = document.getElementById("quick-input-beta-min");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;

    saveProjectState();
    triggerCalculation();
    showToast(`Limite inferior de β ajustado para ${num.toFixed(2)}.`, "info");
}

function syncBetaMax(val) {
    const num = Math.max(0.1, parseMath(val, 1.8));
    projectData.beta_max = num;
    const elParam = document.getElementById("input-beta-max");
    const elQuick = document.getElementById("quick-input-beta-max");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;

    saveProjectState();
    triggerCalculation();
    showToast(`Limite superior de β ajustado para ${num.toFixed(2)} (AASHTO 2017).`, "info");
}"""

# 5. Update syncTargetLoad and syncPileDiameter
target_sync_target_diam = """function syncTargetLoad(val) {
    const num = Math.max(1, parseFloat(val) || 21400.0);
    projectData.target_load_kN = num;

    if (projectData.axes && Array.isArray(projectData.axes)) {
        projectData.axes.forEach(ax => {
            if (!ax.has_custom_target) {
                ax.target_load_kN = num;
            }
        });
    }

    const elQuick = document.getElementById("quick-input-target-load");
    const elParam = document.getElementById("input-target-load");
    const elKpi = document.getElementById("kpi-target-load");
    const elSummaryTarget = document.getElementById("summary-target-text");
    const elSummaryCritBadge = document.getElementById("summary-crit-target-badge");

    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = Number(num).toLocaleString("pt-BR");
    if (elSummaryTarget) elSummaryTarget.innerText = `${Number(num).toLocaleString("pt-BR")} kN`;
    if (elSummaryCritBadge) elSummaryCritBadge.innerText = `Alvo: ${Number(num).toLocaleString("pt-BR")} kN`;

    updateKPIs();
    triggerCalculation();
}

function syncPileDiameter(idx, val) {
    const dVal = parseFloat(val);
    if (isNaN(dVal) || dVal <= 0) return;"""

replacement_sync_target_diam = """function syncTargetLoad(val) {
    const num = Math.max(1, parseMath(val, 21400.0));
    projectData.target_load_kN = num;

    if (projectData.axes && Array.isArray(projectData.axes)) {
        projectData.axes.forEach(ax => {
            if (!ax.has_custom_target) {
                ax.target_load_kN = num;
            }
        });
    }

    const elQuick = document.getElementById("quick-input-target-load");
    const elParam = document.getElementById("input-target-load");
    const elKpi = document.getElementById("kpi-target-load");
    const elSummaryTarget = document.getElementById("summary-target-text");
    const elSummaryCritBadge = document.getElementById("summary-crit-target-badge");

    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = Number(num).toLocaleString("pt-BR");
    if (elSummaryTarget) elSummaryTarget.innerText = `${Number(num).toLocaleString("pt-BR")} kN`;
    if (elSummaryCritBadge) elSummaryCritBadge.innerText = `Alvo: ${Number(num).toLocaleString("pt-BR")} kN`;

    updateKPIs();
    triggerCalculation();
}

function syncPileDiameter(idx, val) {
    const dVal = parseMath(val, NaN);
    if (isNaN(dVal) || dVal <= 0) return;"""

# 6. Update updateAxis* functions
target_axis_updates = """function updateAxisCotaTopo(axisName, val) {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.cota_inicio_m = num;
        ax.cota_topo_m = num;

        // Sincroniza inputs em ambas as abas se existirem
        const inTab2 = document.getElementById(`input-axis-cota-${axisName}`);
        if (inTab2 && parseFloat(inTab2.value) !== num) inTab2.value = num.toFixed(2);
        const inTab4 = document.getElementById(`input-tab4-axis-cota-${axisName}`);
        if (inTab4 && parseFloat(inTab4.value) !== num) inTab4.value = num.toFixed(2);

        saveProjectState();
        triggerCalculation();
    }
}

function updateAxisTargetLoad(axisName, val) {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return;
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.target_load_kN = num;
        ax.has_custom_target = true;
        saveProjectState();
        triggerCalculation();
    }
}

function updateAxisCasingLength(axisName, val) {
    const raw = (typeof val === "string") ? val.trim() : val;
    let num = null;
    if (raw !== "" && raw !== null && raw !== undefined) {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed >= 0) {
            num = parsed;
        }
    }
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.casing_length_m = num;
        saveProjectState();
        triggerCalculation();
    }
}

function updateAxisLengthAbove(axisName, val) {
    const raw = (typeof val === "string") ? val.trim() : val;
    let num = null;
    if (raw !== "" && raw !== null && raw !== undefined) {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed >= 0) {
            num = parsed;
        }
    }
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.pile_length_above_start_m = num;
        saveProjectState();
        triggerCalculation();
    }
}"""

replacement_axis_updates = """function updateAxisCotaTopo(axisName, val) {
    const num = parseMath(val, NaN);
    if (isNaN(num)) return;
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.cota_inicio_m = num;
        ax.cota_topo_m = num;

        // Sincroniza inputs em ambas as abas se existirem
        const inTab2 = document.getElementById(`input-axis-cota-${axisName}`);
        if (inTab2 && parseMath(inTab2.value) !== num) inTab2.value = num.toFixed(2);
        const inTab4 = document.getElementById(`input-tab4-axis-cota-${axisName}`);
        if (inTab4 && parseMath(inTab4.value) !== num) inTab4.value = num.toFixed(2);

        saveProjectState();
        triggerCalculation();
    }
}

function updateAxisTargetLoad(axisName, val) {
    const num = parseMath(val, NaN);
    if (isNaN(num) || num <= 0) return;
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.target_load_kN = num;
        ax.has_custom_target = true;
        saveProjectState();
        triggerCalculation();
    }
}

function updateAxisCasingLength(axisName, val) {
    const raw = (typeof val === "string") ? val.trim() : val;
    let num = null;
    if (raw !== "" && raw !== null && raw !== undefined) {
        const parsed = parseMath(raw, NaN);
        if (!isNaN(parsed) && parsed >= 0) {
            num = parsed;
        }
    }
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.casing_length_m = num;
        saveProjectState();
        triggerCalculation();
    }
}

function updateAxisLengthAbove(axisName, val) {
    const raw = (typeof val === "string") ? val.trim() : val;
    let num = null;
    if (raw !== "" && raw !== null && raw !== undefined) {
        const parsed = parseMath(raw, NaN);
        if (!isNaN(parsed) && parsed >= 0) {
            num = parsed;
        }
    }
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.pile_length_above_start_m = num;
        saveProjectState();
        triggerCalculation();
    }
}"""

# 7. End of renderTab4AxesTable: call enableMathInInputs
target_end_tab4 = """        tbody.appendChild(tr);
    });
}"""

replacement_end_tab4 = """        tbody.appendChild(tr);
    });
    if (typeof enableMathInInputs === "function") enableMathInInputs();
}"""

# 8. syncExtrapolationSettings
target_sync_extrap = """function syncExtrapolationSettings() {
    projectData.spt01_measured_depth_m = parseFloat(document.getElementById("input-spt01-depth")?.value || 44.4);
    projectData.base_depth_m = projectData.spt01_measured_depth_m;
    projectData.extrapolation_n_percentile = parseFloat(document.getElementById("input-extrap-percentile")?.value || 15.0);
    projectData.extrapolation_soil_group = document.getElementById("select-extrap-soil")?.value || "auto";
    projectData.extrapolation_max_depth_m = parseFloat(document.getElementById("input-extrap-max-depth")?.value || 132.6);
    triggerCalculation();
}"""

replacement_sync_extrap = """function syncExtrapolationSettings() {
    projectData.spt01_measured_depth_m = parseMath(document.getElementById("input-spt01-depth")?.value, 44.4);
    projectData.base_depth_m = projectData.spt01_measured_depth_m;
    projectData.extrapolation_n_percentile = parseMath(document.getElementById("input-extrap-percentile")?.value, 15.0);
    projectData.extrapolation_soil_group = document.getElementById("select-extrap-soil")?.value || "auto";
    projectData.extrapolation_max_depth_m = parseMath(document.getElementById("input-extrap-max-depth")?.value, 132.6);
    triggerCalculation();
}"""

# 9. triggerCalculation
target_trigger_calc = """// Execução do Cálculo
function triggerCalculation() {
    // Lê parâmetros da interface
    projectData.water_table_m = parseFloat(document.getElementById("input-water-table")?.value || 3.0);
    projectData.fs_global = parseFloat(document.getElementById("input-fs")?.value || 2.0);
    projectData.fs = projectData.fs_global;
    projectData.fs_lateral = parseFloat(document.getElementById("input-fs-lateral")?.value || 1.5);
    projectData.fs_ponta = parseFloat(document.getElementById("input-fs-ponta")?.value || 3.0);
    projectData.apply_beta_fhwa_limit = document.getElementById("check-apply-beta-fhwa") ? document.getElementById("check-apply-beta-fhwa").checked : true;
    const elShallowStress = document.getElementById("quick-check-shallow-stress") || document.getElementById("check-apply-shallow-stress");
    projectData.apply_shallow_stress_limit = elShallowStress ? elShallowStress.checked : true;
    projectData.beta_shallow_stress_limit_kpa = parseFloat(document.getElementById("input-shallow-stress")?.value || 43.1);
    const elBetaCapKp = document.getElementById("quick-check-beta-cap-kp") || document.getElementById("check-beta-cap-kp");
    projectData.beta_cap_kp_tan_phi = elBetaCapKp ? elBetaCapKp.checked : true;
    const elBetaLimits = document.getElementById("quick-check-apply-beta-limits") || document.getElementById("check-apply-beta-limits");
    projectData.apply_beta_limits = elBetaLimits ? elBetaLimits.checked : true;
    updateBetaInputsEnabled(projectData.apply_beta_limits);

    const targetInputVal = document.getElementById("quick-input-target-load")?.value || document.getElementById("input-target-load")?.value;
    if (targetInputVal !== undefined && targetInputVal !== "") {
        const parsedTarget = parseFloat(targetInputVal);
        if (!isNaN(parsedTarget) && parsedTarget > 0) {
            projectData.target_load_kN = parsedTarget;
        }
    }
    if (projectData.axes && Array.isArray(projectData.axes)) {
        projectData.axes.forEach(ax => {
            if (!ax.has_custom_target) {
                ax.target_load_kN = projectData.target_load_kN;
            }
        });
    }
    projectData.percentile = parseFloat(document.getElementById("input-percentile")?.value || 10.0);
    projectData.critical_sounding = document.getElementById("input-critical-sounding")?.value || "SPT-01";
    projectData.casing_reduction_pct = parseFloat(document.getElementById("input-casing-reduction")?.value ?? 10.0);
    projectData.casing_reduction_mode = document.getElementById("select-casing-mode")?.value || "excel_formula";
    const casingLenVal = document.getElementById("input-casing-length")?.value ?? document.getElementById("quick-input-casing-len")?.value;
    if (casingLenVal !== "" && casingLenVal !== null && casingLenVal !== undefined) {
        const parsedLen = parseFloat(casingLenVal);
        projectData.casing_length_m = (!isNaN(parsedLen) && parsedLen >= 0) ? parsedLen : null;
    } else {
        projectData.casing_length_m = null;
    }
    projectData.kp_base = parseFloat(document.getElementById("input-kp-base")?.value || 0.59);
    projectData.cn_max = parseFloat(document.getElementById("input-cn-max")?.value || 2.0);
    projectData.pa_kpa = parseFloat(document.getElementById("input-pa-kpa")?.value || 101.3);

    const lenAboveVal = document.getElementById("input-pile-length-above-start")?.value ?? document.getElementById("quick-input-pile-len-above")?.value;
    if (lenAboveVal !== "" && lenAboveVal !== null && lenAboveVal !== undefined) {
        const parsedLenAbove = parseFloat(lenAboveVal);
        projectData.pile_length_above_start_m = (!isNaN(parsedLenAbove) && parsedLenAbove >= 0) ? parsedLenAbove : 0.0;
    }

    // Métodos normativos de cálculo
    projectData.lateral_method = document.getElementById("quick-select-lateral-method")?.value || document.getElementById("select-lateral-method")?.value || "mayne_fhwa";
    projectData.tip_method = document.getElementById("quick-select-tip-method")?.value || document.getElementById("select-tip-method")?.value || "aashto_2007";
    projectData.qs_max_ksf = parseFloat(document.getElementById("input-qs-max-ksf")?.value || 4.0);
    projectData.qp_max_ksf = parseFloat(document.getElementById("input-qp-max-ksf")?.value || 60.0);
    projectData.beta_min = parseFloat(document.getElementById("input-beta-min")?.value || document.getElementById("quick-input-beta-min")?.value || 0.25);
    projectData.beta_max = parseFloat(document.getElementById("input-beta-max")?.value || document.getElementById("quick-input-beta-max")?.value || 1.8);

    const elQsCap = document.getElementById("quick-check-apply-qs-cap") || document.getElementById("check-apply-qs-cap");
    if (elQsCap) projectData.apply_qs_cap = elQsCap.checked;

    const elQpCap = document.getElementById("quick-check-apply-qp-cap") || document.getElementById("check-apply-qp-cap");
    if (elQpCap) projectData.apply_qp_cap = elQpCap.checked;

    const elBetaRef = document.getElementById("quick-select-beta-depth-ref") || document.getElementById("select-beta-depth-ref");
    if (elBetaRef) projectData.beta_depth_ref = elBetaRef.value;

    // Parâmetros de Extrapolação de Solo Profundo
    projectData.spt01_measured_depth_m = parseFloat(document.getElementById("input-spt01-depth")?.value || 44.4);
    projectData.base_depth_m = projectData.spt01_measured_depth_m;
    projectData.extrapolation_n_percentile = parseFloat(document.getElementById("input-extrap-percentile")?.value || 15.0);
    projectData.extrapolation_soil_group = document.getElementById("select-extrap-soil")?.value || "auto";
    projectData.extrapolation_max_depth_m = parseFloat(document.getElementById("input-extrap-max-depth")?.value || 132.6);"""

replacement_trigger_calc = """// Execução do Cálculo
function triggerCalculation() {
    // Lê parâmetros da interface (aceita números diretos e equações matemáticas)
    projectData.water_table_m = parseMath(document.getElementById("input-water-table")?.value, 3.0);
    projectData.fs_global = parseMath(document.getElementById("input-fs")?.value, 2.0);
    projectData.fs = projectData.fs_global;
    projectData.fs_lateral = parseMath(document.getElementById("input-fs-lateral")?.value, 1.5);
    projectData.fs_ponta = parseMath(document.getElementById("input-fs-ponta")?.value, 3.0);
    projectData.apply_beta_fhwa_limit = document.getElementById("check-apply-beta-fhwa") ? document.getElementById("check-apply-beta-fhwa").checked : true;
    const elShallowStress = document.getElementById("quick-check-shallow-stress") || document.getElementById("check-apply-shallow-stress");
    projectData.apply_shallow_stress_limit = elShallowStress ? elShallowStress.checked : true;
    projectData.beta_shallow_stress_limit_kpa = parseMath(document.getElementById("input-shallow-stress")?.value, 43.1);
    const elBetaCapKp = document.getElementById("quick-check-beta-cap-kp") || document.getElementById("check-beta-cap-kp");
    projectData.beta_cap_kp_tan_phi = elBetaCapKp ? elBetaCapKp.checked : true;
    const elBetaLimits = document.getElementById("quick-check-apply-beta-limits") || document.getElementById("check-apply-beta-limits");
    projectData.apply_beta_limits = elBetaLimits ? elBetaLimits.checked : true;
    updateBetaInputsEnabled(projectData.apply_beta_limits);

    const targetInputVal = document.getElementById("quick-input-target-load")?.value || document.getElementById("input-target-load")?.value;
    if (targetInputVal !== undefined && targetInputVal !== "") {
        const parsedTarget = parseMath(targetInputVal, NaN);
        if (!isNaN(parsedTarget) && parsedTarget > 0) {
            projectData.target_load_kN = parsedTarget;
        }
    }
    if (projectData.axes && Array.isArray(projectData.axes)) {
        projectData.axes.forEach(ax => {
            if (!ax.has_custom_target) {
                ax.target_load_kN = projectData.target_load_kN;
            }
        });
    }
    projectData.percentile = parseMath(document.getElementById("input-percentile")?.value, 10.0);
    projectData.critical_sounding = document.getElementById("input-critical-sounding")?.value || "SPT-01";
    projectData.casing_reduction_pct = parseMath(document.getElementById("input-casing-reduction")?.value, 10.0);
    projectData.casing_reduction_mode = document.getElementById("select-casing-mode")?.value || "excel_formula";
    const casingLenVal = document.getElementById("input-casing-length")?.value ?? document.getElementById("quick-input-casing-len")?.value;
    if (casingLenVal !== "" && casingLenVal !== null && casingLenVal !== undefined) {
        const parsedLen = parseMath(casingLenVal, NaN);
        projectData.casing_length_m = (!isNaN(parsedLen) && parsedLen >= 0) ? parsedLen : null;
    } else {
        projectData.casing_length_m = null;
    }
    projectData.kp_base = parseMath(document.getElementById("input-kp-base")?.value, 0.59);
    projectData.cn_max = parseMath(document.getElementById("input-cn-max")?.value, 2.0);
    projectData.pa_kpa = parseMath(document.getElementById("input-pa-kpa")?.value, 101.3);

    const lenAboveVal = document.getElementById("input-pile-length-above-start")?.value ?? document.getElementById("quick-input-pile-len-above")?.value;
    if (lenAboveVal !== "" && lenAboveVal !== null && lenAboveVal !== undefined) {
        const parsedLenAbove = parseMath(lenAboveVal, NaN);
        projectData.pile_length_above_start_m = (!isNaN(parsedLenAbove) && parsedLenAbove >= 0) ? parsedLenAbove : 0.0;
    }

    // Métodos normativos de cálculo
    projectData.lateral_method = document.getElementById("quick-select-lateral-method")?.value || document.getElementById("select-lateral-method")?.value || "mayne_fhwa";
    projectData.tip_method = document.getElementById("quick-select-tip-method")?.value || document.getElementById("select-tip-method")?.value || "aashto_2007";
    projectData.qs_max_ksf = parseMath(document.getElementById("input-qs-max-ksf")?.value, 4.0);
    projectData.qp_max_ksf = parseMath(document.getElementById("input-qp-max-ksf")?.value, 60.0);
    projectData.beta_min = parseMath(document.getElementById("input-beta-min")?.value || document.getElementById("quick-input-beta-min")?.value, 0.25);
    projectData.beta_max = parseMath(document.getElementById("input-beta-max")?.value || document.getElementById("quick-input-beta-max")?.value, 1.8);

    const elQsCap = document.getElementById("quick-check-apply-qs-cap") || document.getElementById("check-apply-qs-cap");
    if (elQsCap) projectData.apply_qs_cap = elQsCap.checked;

    const elQpCap = document.getElementById("quick-check-apply-qp-cap") || document.getElementById("check-apply-qp-cap");
    if (elQpCap) projectData.apply_qp_cap = elQpCap.checked;

    const elBetaRef = document.getElementById("quick-select-beta-depth-ref") || document.getElementById("select-beta-depth-ref");
    if (elBetaRef) projectData.beta_depth_ref = elBetaRef.value;

    // Parâmetros de Extrapolação de Solo Profundo
    projectData.spt01_measured_depth_m = parseMath(document.getElementById("input-spt01-depth")?.value, 44.4);
    projectData.base_depth_m = projectData.spt01_measured_depth_m;
    projectData.extrapolation_n_percentile = parseMath(document.getElementById("input-extrap-percentile")?.value, 15.0);
    projectData.extrapolation_soil_group = document.getElementById("select-extrap-soil")?.value || "auto";
    projectData.extrapolation_max_depth_m = parseMath(document.getElementById("input-extrap-max-depth")?.value, 132.6);"""

# 10. End of renderAxesTable: call enableMathInInputs
target_end_render_axes = """        if (prevDiamVal && Array.from(selDiam.options).some(o => o.value === prevDiamVal)) {
            selDiam.value = prevDiamVal;
        }
    }
}"""

replacement_end_render_axes = """        if (prevDiamVal && Array.from(selDiam.options).some(o => o.value === prevDiamVal)) {
            selDiam.value = prevDiamVal;
        }
    }
    if (typeof enableMathInInputs === "function") enableMathInInputs();
}"""

replacements = [
    (target_init, replacement_init, "init"),
    (target_sync_concrete, replacement_sync_concrete, "sync_concrete"),
    (target_sync_casing_fs, replacement_sync_casing_fs, "sync_casing_fs"),
    (target_sync_qs_beta, replacement_sync_qs_beta, "sync_qs_beta"),
    (target_sync_target_diam, replacement_sync_target_diam, "sync_target_diam"),
    (target_axis_updates, replacement_axis_updates, "axis_updates"),
    (target_end_tab4, replacement_end_tab4, "end_tab4"),
    (target_sync_extrap, replacement_sync_extrap, "sync_extrap"),
    (target_trigger_calc, replacement_trigger_calc, "trigger_calc"),
    (target_end_render_axes, replacement_end_render_axes, "end_render_axes"),
]

for target, repl, name in replacements:
    if target not in normalized:
        print(f"FAILED to find {name}!")
        sys.exit(1)
    else:
        print(f"Found {name}")
        normalized = normalized.replace(target, repl, 1)

if is_crlf:
    final_content = normalized.replace('\n', '\r\n')
else:
    final_content = normalized

with open('gui/capacidade_estaca.js', 'w', encoding='utf-8') as f:
    f.write(final_content)

print("Successfully updated gui/capacidade_estaca.js!")
