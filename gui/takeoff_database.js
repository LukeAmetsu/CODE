/**
 * Takeoff & Budget Database Frontend Controller
 * Supports dual-mode: Eel desktop environment & Standalone Web/Cloud HTTP API
 */

// Application State
let activeMainTab = 'repo';
let activeCategory = 'todas';
let activeReviewFilter = 'todas';
let activeDocType = 'todas';
let currentSearch = '';
let currentEntries = [];
let activeEntryBeingEdited = null;
let currentEstimateCategory = 'termoeletrica';

// API Client Abstraction (Eel or Cloud REST)
const apiClient = {
    isEelAvailable() {
        return typeof window.eel !== 'undefined' && typeof window.eel.takeoff_list_entries === 'function';
    },

    async listEntries(category = null, search = null, structureType = null, reviewStatus = null, docType = null) {
        if (this.isEelAvailable()) {
            return await window.eel.takeoff_list_entries(category, search, structureType, reviewStatus, docType)();
        } else {
            const params = new URLSearchParams();
            if (category && category !== 'todas') params.append('category', category);
            if (search) params.append('search', search);
            if (structureType) params.append('structure_type', structureType);
            if (reviewStatus && reviewStatus !== 'todas') params.append('review_status', reviewStatus);
            if (docType && docType !== 'todas') params.append('doc_type', docType);
            const res = await fetch(`/api/takeoff/entries?${params.toString()}`);
            return await res.json();
        }
    },

    async uploadAndExtract(fileBase64, filename) {
        if (this.isEelAvailable()) {
            return await window.eel.takeoff_upload_and_extract(fileBase64, filename)();
        } else {
            const res = await fetch('/api/takeoff/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_base64: fileBase64, filename: filename })
            });
            return await res.json();
        }
    },

    async saveEntry(entryData) {
        if (this.isEelAvailable()) {
            return await window.eel.takeoff_save_entry(entryData)();
        } else {
            const res = await fetch('/api/takeoff/entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entryData)
            });
            return await res.json();
        }
    },

    async getEntry(entryId) {
        if (this.isEelAvailable()) {
            return await window.eel.takeoff_get_entry(entryId)();
        } else {
            const res = await fetch(`/api/takeoff/entries/${entryId}`);
            return await res.json();
        }
    },

    async openDrawing(entryId) {
        if (this.isEelAvailable() && typeof window.eel.takeoff_open_drawing === 'function') {
            return await window.eel.takeoff_open_drawing(entryId)();
        } else {
            const res = await fetch(`/api/takeoff/entries/${entryId}/open`, { method: 'POST' });
            return await res.json();
        }
    },

    async updateReviewStatus(entryId, status) {
        if (this.isEelAvailable() && typeof window.eel.takeoff_update_review_status === 'function') {
            return await window.eel.takeoff_update_review_status(entryId, status)();
        } else {
            const res = await fetch(`/api/takeoff/entries/${entryId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            return await res.json();
        }
    },

    async getDefaultOneDrivePath() {
        if (this.isEelAvailable() && typeof window.eel.takeoff_get_default_onedrive_path === 'function') {
            return await window.eel.takeoff_get_default_onedrive_path()();
        } else {
            const res = await fetch('/api/takeoff/onedrive-path');
            return await res.json();
        }
    },

    async browseFolderDialog(initialPath = null) {
        if (this.isEelAvailable() && typeof window.eel.takeoff_browse_folder_dialog === 'function') {
            return await window.eel.takeoff_browse_folder_dialog(initialPath)();
        }
        return { success: false, error: "Navegação nativa por pastas disponível no modo desktop Eel." };
    },

    async batchScan(folderPath, recursive = true, category = 'termoeletrica', skipExisting = true, keywordFilter = null, focusCivil = false, maxFiles = null, docTypeFilter = null) {
        if (this.isEelAvailable() && typeof window.eel.takeoff_batch_scan_folder === 'function') {
            return await window.eel.takeoff_batch_scan_folder(folderPath, recursive, category, skipExisting, keywordFilter, focusCivil, maxFiles, docTypeFilter)();
        } else {
            const res = await fetch('/api/takeoff/batch-scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    folder_path: folderPath, 
                    recursive, 
                    category, 
                    skip_existing: skipExisting,
                    keyword_filter: keywordFilter,
                    focus_civil: focusCivil,
                    max_files: maxFiles,
                    doc_type_filter: docTypeFilter
                })
            });
            return await res.json();
        }
    },

    async cancelBatchScan() {
        if (this.isEelAvailable() && typeof window.eel.takeoff_cancel_scan === 'function') {
            return await window.eel.takeoff_cancel_scan()();
        }
        return { success: false };
    },

    async deleteEntry(entryId) {
        if (this.isEelAvailable()) {
            return await window.eel.takeoff_delete_entry(entryId)();
        } else {
            const res = await fetch(`/api/takeoff/entries/${entryId}`, { method: 'DELETE' });
            return await res.json();
        }
    },

    async runEstimate(parameters) {
        if (this.isEelAvailable()) {
            return await window.eel.takeoff_run_estimate(parameters)();
        } else {
            const res = await fetch('/api/takeoff/estimate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parameters)
            });
            return await res.json();
        }
    },

    async exportExcel(category = null, entryIds = null) {
        if (this.isEelAvailable()) {
            return await window.eel.takeoff_export_excel(category, entryIds)();
        } else {
            const res = await fetch('/api/takeoff/export-excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, entry_ids: entryIds })
            });
            return await res.json();
        }
    }
};

// ==============================================================================
// INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    setupDragAndDrop();
    initOneDriveHint();
    const folderInput = document.getElementById('batch-folder-input');
    if (folderInput) {
        folderInput.addEventListener('input', (e) => autoDetectCategoryFromPath(e.target.value));
        folderInput.addEventListener('change', (e) => autoDetectCategoryFromPath(e.target.value));
    }
    await loadRepositoryEntries();
    calculateBudgetEstimate();
});

// Register Eel live progress & completion callbacks for batch scanner
if (typeof window.eel !== 'undefined') {
    window.eel.expose(onTakeoffScanProgress, 'takeoff_scan_progress');
    window.eel.expose(onTakeoffScanCompleted, 'takeoff_scan_completed');
}

function onTakeoffScanProgress(pct, msg, currentEntry) {
    updateBatchProgressUI(pct, msg, currentEntry);
}

function onTakeoffScanCompleted(resp) {
    handleBatchScanFinished(resp);
}

// ==============================================================================
// TAB NAVIGATION
// ==============================================================================
function switchMainTab(tabId) {
    activeMainTab = tabId;
    const tabs = ['repo', 'batch', 'upload', 'estimator', 'analytics'];
    tabs.forEach(t => {
        const btn = document.getElementById(`nav-btn-${t}`);
        const content = document.getElementById(`tab-content-${t}`);
        if (btn) {
            if (t === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
        if (content) {
            if (t === tabId) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        }
    });

    if (tabId === 'repo') {
        loadRepositoryEntries();
    }
}

// ==============================================================================
// REPOSITORY & ENTRIES LISTING
// ==============================================================================
async function loadRepositoryEntries() {
    try {
        const resp = await apiClient.listEntries(activeCategory, currentSearch, null, activeReviewFilter, activeDocType);
        if (resp && resp.success) {
            currentEntries = resp.entries || [];
            renderEntriesCards(currentEntries);
            updateGlobalStats(resp.statistics);
        }
    } catch (e) {
        console.error("Erro ao carregar dados do repositório:", e);
    }
}

function setDocTypeFilter(type) {
    activeDocType = type || 'todas';
    const sel = document.getElementById('filter-doc-type');
    if (sel) sel.value = activeDocType;
    loadRepositoryEntries();
}

function updateGlobalStats(stats) {
    if (!stats) return;
    document.getElementById('stat-total-count').textContent = stats.total_count || 0;
    document.getElementById('stat-total-concrete').textContent = `${(stats.total_concrete_m3 || 0).toLocaleString('pt-BR')} m³`;
    document.getElementById('stat-total-steel').textContent = `${(stats.total_steel_ton || 0).toLocaleString('pt-BR')} t`;
    document.getElementById('stat-avg-ratio').textContent = `${(stats.avg_steel_ratio || 0).toLocaleString('pt-BR')} kg/m³`;

    const pending = stats.pending_review_count || 0;
    const badgeCount = document.getElementById('badge-pending-count');
    if (badgeCount) badgeCount.textContent = pending;

    const navBadge = document.getElementById('batch-pending-badge');
    if (navBadge) {
        if (pending > 0) {
            navBadge.textContent = pending;
            navBadge.classList.remove('hidden');
        } else {
            navBadge.classList.add('hidden');
        }
    }
}

function renderEntriesCards(entries) {
    const grid = document.getElementById('repo-cards-grid');
    const empty = document.getElementById('repo-empty-state');
    if (!grid) return;

    grid.innerHTML = '';
    if (!entries || entries.length === 0) {
        grid.classList.add('hidden');
        if (empty) empty.classList.remove('hidden');
        return;
    }

    grid.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');

    entries.forEach(e => {
        const isUTE = e.category === 'termoeletrica';
        const badgeColor = isUTE ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300';
        const icon = isUTE ? '⚡' : '🗼';
        const catName = isUTE ? 'Termelétrica (UTE)' : 'Linha Transmissão / SE';
        const vol = (e.concrete_volume_m3 || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
        const steel = (e.steel_weight_kg || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        const ratio = (e.steel_ratio_kg_m3 || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const formwork = (e.formwork_area_m2 || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

        const docTypeConfig = {
            'desenho': { label: '📐 Desenho', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
            'memorial_calculo': { label: '📑 Memorial de Cálculo', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' },
            'croqui': { label: '✏️ Croqui', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
            'relatorio_tecnico': { label: '📋 Relatório Técnico', color: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
            'especificacao_tecnica': { label: '📜 Especificação', color: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
            'quantitativo_material': { label: '📊 Quantitativo', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
            'outro': { label: '📁 Documento', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
        };
        const dt = docTypeConfig[e.doc_type] || docTypeConfig['desenho'];
        const docTypeBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${dt.color}">${dt.label}</span>`;

        const isPending = e.review_status === 'pending_review';
        const statusBadge = isPending
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/80" title="Registro importado automaticamente. Aguarda sua verificação.">⚠️ Aguarda Verificação</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" title="Registro conferido e validado.">✓ Verificado</span>`;

        const hasDoc = Boolean(e.drawing_filename || e.relative_path || e.sharepoint_url);

        const card = document.createElement('div');
        card.className = `flex flex-col justify-between p-5 rounded-2xl border ${isPending ? 'border-amber-400/60 bg-amber-50/20 dark:bg-amber-950/10' : 'border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]'} hover:border-blue-500/60 transition-all hover:shadow-lg relative group`;
        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between gap-1.5 mb-2 flex-wrap">
                    <div class="flex items-center gap-1.5">
                        ${docTypeBadge}
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeColor}">
                            <span>${icon}</span>
                            <span>${catName}</span>
                        </span>
                    </div>
                    ${statusBadge}
                </div>

                <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="text-[11px] font-bold text-slate-400 truncate">${e.drawing_code ? 'CÓD: ' + e.drawing_code : ''}</span>
                    <span class="text-[10px] text-slate-400 font-medium">${e.revision ? 'Rev. ' + e.revision : ''}</span>
                </div>

                <h3 class="text-sm font-black text-[var(--color-text-primary)] leading-tight mb-1 group-hover:text-blue-600 transition-colors">
                    ${e.equipment_name}
                </h3>
                <div class="text-[11px] text-[var(--color-text-secondary)] font-medium mb-3">
                    ${e.project_name} • <span class="text-slate-400">${e.structure_type || 'Fundação'}</span>
                </div>

                <!-- Quantities Badge Matrix -->
                <div class="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-xs mb-4">
                    <div>
                        <span class="text-[9px] uppercase font-bold text-slate-400 block">Concreto</span>
                        <span class="font-extrabold text-blue-600 dark:text-blue-400">${vol} m³</span>
                    </div>
                    <div>
                        <span class="text-[9px] uppercase font-bold text-slate-400 block">Aço CA-50</span>
                        <span class="font-extrabold text-amber-600 dark:text-amber-400">${steel} kg</span>
                    </div>
                    <div>
                        <span class="text-[9px] uppercase font-bold text-slate-400 block">Taxa Armadura</span>
                        <span class="font-extrabold text-emerald-600 dark:text-emerald-400">${ratio} kg/m³</span>
                    </div>
                    <div>
                        <span class="text-[9px] uppercase font-bold text-slate-400 block">Fôrma</span>
                        <span class="font-extrabold text-purple-600 dark:text-purple-400">${formwork} m²</span>
                    </div>
                </div>
            </div>

            <!-- Card Actions -->
            <div class="pt-3 border-t border-[var(--color-border-primary)] flex items-center justify-between gap-1.5 mt-auto">
                <button onclick="openDetailModal('${e.id}')"
                    class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                    <span>🔍 Detalhes</span>
                </button>

                <div class="flex items-center gap-1.5">
                    ${hasDoc ? `
                    <button onclick="openDrawingFile('${e.id}')" title="Abrir PDF da Prancha"
                        class="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-blue-800 text-[11px] font-bold text-blue-700 dark:text-blue-300 transition-all flex items-center gap-1">
                        <span>📄</span>
                        <span>PDF</span>
                    </button>` : ''}

                    <button onclick="loadEntryToEdit('${e.id}')"
                        class="px-2.5 py-1 rounded-lg bg-[var(--color-bg-primary)] hover:bg-blue-600 hover:text-white border border-[var(--color-border-primary)] text-[11px] font-bold transition-all">
                        ✏️ Editar
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function setCategoryFilter(cat) {
    activeCategory = cat;
    ['all', 'ute', 'lt'].forEach(c => {
        const btn = document.getElementById(`filter-cat-${c}`);
        if (!btn) return;
        const target = c === 'all' ? 'todas' : (c === 'ute' ? 'termoeletrica' : 'linha_transmissao');
        if (target === cat) {
            btn.className = "cat-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white transition-all";
        } else {
            btn.className = "cat-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all";
        }
    });
    loadRepositoryEntries();
}

function setReviewFilter(status) {
    activeReviewFilter = status;
    ['all', 'pending', 'verified'].forEach(st => {
        const btn = document.getElementById(`filter-status-${st}`);
        if (!btn) return;
        const isActive = (st === 'all' && status === 'todas') || st === status || (st === 'pending' && status === 'pending_review');
        if (isActive) {
            btn.className = "status-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white transition-all shadow-xs";
        } else {
            btn.className = "status-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all";
        }
    });
    loadRepositoryEntries();
}

function handleSearchKey(event) {
    if (event.key === 'Enter') {
        applyFilters();
    }
}

function applyFilters() {
    const input = document.getElementById('repo-search-input');
    currentSearch = input ? input.value.trim() : '';
    loadRepositoryEntries();
}

// ==============================================================================
// UPLOAD & INTELLIGENT EXTRACTION
// ==============================================================================
function setupDragAndDrop() {
    const dropzone = document.getElementById('upload-dropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('border-blue-600', 'bg-blue-100/50');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('border-blue-600', 'bg-blue-100/50');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            processFile(files[0]);
        }
    });
}

function handleFileSelected(event) {
    const file = event.target.files[0];
    if (file) {
        processFile(file);
    }
}

async function processFile(file) {
    const statusCard = document.getElementById('extraction-status-card');
    const badge = document.getElementById('extraction-badge');
    const msg = document.getElementById('extraction-message');
    const nameInfo = document.getElementById('file-name-info');
    const sizeInfo = document.getElementById('file-size-info');

    if (statusCard) statusCard.classList.remove('hidden');
    if (badge) {
        badge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 animate-pulse";
        badge.textContent = "Processando Prancha...";
    }
    if (msg) msg.textContent = `Lendo camadas, textos e tabelas de quantitativos de ${file.name}...`;
    if (nameInfo) nameInfo.textContent = file.name;
    if (sizeInfo) sizeInfo.textContent = `${(file.size / 1024).toFixed(1)} KB`;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Data = e.target.result;
        try {
            const resp = await apiClient.uploadAndExtract(base64Data, file.name);
            if (resp && resp.success) {
                if (badge) {
                    badge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
                    badge.textContent = "Leitura Concluída";
                }
                if (msg) msg.textContent = "Dados extraídos com sucesso! Revise os campos e a tabela ao lado. Você pode alterar tudo livremente.";
                populateFormWithExtractedData(resp.data);
            } else {
                if (badge) {
                    badge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700";
                    badge.textContent = "Aviso";
                }
                if (msg) msg.textContent = resp.error || "Não foi possível extrair automaticamente todos os dados. O formulário está liberado para inserção manual.";
            }
        } catch (err) {
            console.error("Falha na extração:", err);
            if (badge) {
                badge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800";
                badge.textContent = "Edição Manual";
            }
            if (msg) msg.textContent = "Preencha os dados da prancha diretamente na tabela ao lado.";
        }
    };
    reader.readAsDataURL(file);
}

// ==============================================================================
// FORM & DYNAMIC QUANTITIES TABLE (100% USER-EDITABLE)
// ==============================================================================
function populateFormWithExtractedData(data) {
    activeEntryBeingEdited = data.id || null;

    setVal('edit-doc-type', data.doc_type || 'desenho');
    setVal('edit-category', data.category || 'termoeletrica');
    setVal('edit-equipment-name', data.equipment_name || '');
    setVal('edit-project-name', data.project_name || '');
    setVal('edit-structure-type', data.structure_type || '');
    setVal('edit-drawing-code', data.drawing_code || '');
    setVal('edit-revision', data.revision || '0');
    setVal('edit-fck', data.fck_concrete || 30);
    setVal('edit-soil', data.soil_condition || 'Solo Normal');
    setVal('edit-notes', data.notes || '');
    setVal('edit-sharepoint-url', data.sharepoint_url || '');
    setVal('edit-review-status', data.review_status || 'verified');
    setVal('edit-drawing-filename', data.drawing_filename || '');
    setVal('edit-relative-path', data.relative_path || '');
    setVal('edit-source-folder', data.source_folder || '');

    // Render materials line items
    renderMaterialsTable(data.line_items || []);
    recalculateLiveTotals();
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function renderMaterialsTable(items) {
    const tbody = document.getElementById('materials-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!items || items.length === 0) {
        items = [
            { item: "Concreto Estrutural", spec: "fck 30 MPa", unit: "m³", quantity: 0, notes: "" },
            { item: "Aço Armadura CA-50", spec: "Cortado e dobrado", unit: "kg", quantity: 0, notes: "" },
            { item: "Fôrma Resinada", spec: "Chapas compensadas", unit: "m²", quantity: 0, notes: "" }
        ];
    }

    items.forEach((it, idx) => {
        addMaterialRowToDOM(it, idx);
    });
}

function addMaterialRowToDOM(it, idx) {
    const tbody = document.getElementById('materials-table-body');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors";
    tr.innerHTML = `
        <td class="p-2">
            <input type="text" class="w-full bg-transparent border-0 border-b border-transparent focus:border-blue-500 text-xs font-semibold p-1 focus:outline-none editable-item"
                value="${escapeHtml(it.item || '')}" placeholder="Nome do Material" oninput="recalculateLiveTotals()">
        </td>
        <td class="p-2">
            <input type="text" class="w-full bg-transparent border-0 border-b border-transparent focus:border-blue-500 text-xs p-1 focus:outline-none editable-spec"
                value="${escapeHtml(it.spec || '')}" placeholder="Especificação Técnica">
        </td>
        <td class="p-2 text-center">
            <select class="bg-transparent border border-[var(--color-border-primary)] rounded px-1.5 py-1 text-xs focus:outline-none editable-unit" onchange="recalculateLiveTotals()">
                <option value="m³" ${it.unit === 'm³' || it.unit === 'm3' ? 'selected' : ''}>m³</option>
                <option value="kg" ${it.unit === 'kg' ? 'selected' : ''}>kg</option>
                <option value="m²" ${it.unit === 'm²' || it.unit === 'm2' ? 'selected' : ''}>m²</option>
                <option value="m" ${it.unit === 'm' ? 'selected' : ''}>m</option>
                <option value="un" ${it.unit === 'un' ? 'selected' : ''}>un</option>
                <option value="t" ${it.unit === 't' ? 'selected' : ''}>t</option>
            </select>
        </td>
        <td class="p-2 text-right">
            <input type="number" step="any" class="w-full text-right bg-transparent border-0 border-b border-transparent focus:border-blue-500 text-xs font-bold p-1 focus:outline-none editable-qty"
                value="${it.quantity || 0}" oninput="recalculateLiveTotals()">
        </td>
        <td class="p-2">
            <input type="text" class="w-full bg-transparent border-0 border-b border-transparent focus:border-blue-500 text-xs text-slate-400 p-1 focus:outline-none editable-notes"
                value="${escapeHtml(it.notes || '')}" placeholder="Obs...">
        </td>
        <td class="p-2 text-center">
            <button onclick="removeMaterialRow(this)" title="Excluir Linha" class="text-slate-400 hover:text-red-500 text-sm font-bold">
                ✕
            </button>
        </td>
    `;
    tbody.appendChild(tr);
}

function addNewMaterialRow() {
    addMaterialRowToDOM({ item: "", spec: "", unit: "m³", quantity: 0, notes: "" }, Date.now());
}

function removeMaterialRow(btn) {
    const row = btn.closest('tr');
    if (row) {
        row.remove();
        recalculateLiveTotals();
    }
}

function recalculateLiveTotals() {
    let totConcrete = 0.0;
    let totSteel = 0.0;
    let totFormwork = 0.0;
    let totExcavation = 0.0;

    const rows = document.querySelectorAll('#materials-table-body tr');
    rows.forEach(tr => {
        const itemInput = tr.querySelector('.editable-item');
        const unitSelect = tr.querySelector('.editable-unit');
        const qtyInput = tr.querySelector('.editable-qty');

        const itemName = (itemInput ? itemInput.value : '').toLowerCase();
        const unit = unitSelect ? unitSelect.value : '';
        const qty = parseFloat(qtyInput ? qtyInput.value : 0) || 0.0;

        if (unit === 'm³' || unit === 'm3') {
            if (itemName.includes('escava') || itemName.includes('terra')) {
                totExcavation += qty;
            } else if (itemName.includes('magro') || itemName.includes('lastro')) {
                // Lean concrete
            } else {
                totConcrete += qty;
            }
        } else if (unit === 'kg') {
            if (itemName.includes('aço') || itemName.includes('armadura') || itemName.includes('ca-50') || itemName.includes('rebar')) {
                totSteel += qty;
            } else {
                totSteel += qty;
            }
        } else if (unit === 't') {
            totSteel += qty * 1000.0;
        } else if (unit === 'm²' || unit === 'm2') {
            totFormwork += qty;
        }
    });

    const ratio = totConcrete > 0.001 ? (totSteel / totConcrete) : 0.0;

    document.getElementById('summary-live-concrete').textContent = `${totConcrete.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³`;
    document.getElementById('summary-live-steel').textContent = `${totSteel.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg`;
    document.getElementById('summary-live-ratio').textContent = `${ratio.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg/m³`;
    document.getElementById('summary-live-formwork').textContent = `${totFormwork.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

function getTableLineItems() {
    const items = [];
    const rows = document.querySelectorAll('#materials-table-body tr');
    rows.forEach(tr => {
        const item = tr.querySelector('.editable-item')?.value || '';
        const spec = tr.querySelector('.editable-spec')?.value || '';
        const unit = tr.querySelector('.editable-unit')?.value || 'm³';
        const qty = parseFloat(tr.querySelector('.editable-qty')?.value || 0) || 0.0;
        const notes = tr.querySelector('.editable-notes')?.value || '';

        if (item.trim() || qty > 0) {
            items.push({
                item: item.trim(),
                spec: spec.trim(),
                unit: unit,
                quantity: qty,
                notes: notes.trim()
            });
        }
    });
    return items;
}

async function saveCurrentEntryToDB() {
    const equipmentName = getVal('edit-equipment-name').trim();
    const projectName = getVal('edit-project-name').trim();

    if (!equipmentName) {
        alert("Por favor, informe o Nome do Equipamento ou Estrutura.");
        document.getElementById('edit-equipment-name').focus();
        return;
    }

    const items = getTableLineItems();

    // Extract totals from items
    let volConcrete = 0.0;
    let weightSteel = 0.0;
    let areaFormwork = 0.0;
    let volExcavation = 0.0;

    items.forEach(it => {
        const name = it.item.toLowerCase();
        const u = it.unit.toLowerCase();
        if (u === 'm³' || u === 'm3') {
            if (name.includes('escava') || name.includes('terra')) volExcavation += it.quantity;
            else if (!name.includes('magro') && !name.includes('lastro')) volConcrete += it.quantity;
        } else if (u === 'kg') {
            weightSteel += it.quantity;
        } else if (u === 't') {
            weightSteel += it.quantity * 1000.0;
        } else if (u === 'm²' || u === 'm2') {
            areaFormwork += it.quantity;
        }
    });

    const entryData = {
        id: activeEntryBeingEdited || undefined,
        doc_type: getVal('edit-doc-type') || 'desenho',
        category: getVal('edit-category'),
        equipment_name: equipmentName,
        project_name: projectName || 'Sem Projeto',
        structure_type: getVal('edit-structure-type') || 'Fundação',
        drawing_code: getVal('edit-drawing-code'),
        revision: getVal('edit-revision') || '0',
        drawing_filename: getVal('edit-drawing-filename') || undefined,
        relative_path: getVal('edit-relative-path') || undefined,
        source_folder: getVal('edit-source-folder') || undefined,
        sharepoint_url: getVal('edit-sharepoint-url') || undefined,
        review_status: getVal('edit-review-status') || 'verified',
        fck_concrete: parseFloat(getVal('edit-fck')) || 30.0,
        soil_condition: getVal('edit-soil') || 'Solo Normal',
        notes: getVal('edit-notes'),
        concrete_volume_m3: volConcrete,
        steel_weight_kg: weightSteel,
        formwork_area_m2: areaFormwork,
        excavation_m3: volExcavation,
        line_items: items
    };

    const statusMsg = document.getElementById('save-status-msg');
    if (statusMsg) statusMsg.textContent = "Salvando registro na base...";

    try {
        const resp = await apiClient.saveEntry(entryData);
        if (resp && resp.success) {
            if (statusMsg) statusMsg.textContent = "Salvo com sucesso!";
            setTimeout(() => {
                if (statusMsg) statusMsg.textContent = "";
                switchMainTab('repo');
            }, 1200);
        } else {
            alert("Erro ao salvar: " + (resp ? resp.error : "Falha desconhecida"));
            if (statusMsg) statusMsg.textContent = "";
        }
    } catch (e) {
        alert("Erro de comunicação ao salvar: " + e.message);
        if (statusMsg) statusMsg.textContent = "";
    }
}

function resetEditorForm() {
    activeEntryBeingEdited = null;
    setVal('edit-equipment-name', '');
    setVal('edit-project-name', '');
    setVal('edit-structure-type', '');
    setVal('edit-drawing-code', '');
    setVal('edit-revision', '0');
    setVal('edit-fck', 30);
    setVal('edit-soil', 'Solo Normal');
    setVal('edit-notes', '');
    setVal('edit-sharepoint-url', '');
    setVal('edit-review-status', 'verified');
    setVal('edit-drawing-filename', '');
    setVal('edit-relative-path', '');
    setVal('edit-source-folder', '');
    renderMaterialsTable([]);
    recalculateLiveTotals();
    const statusCard = document.getElementById('extraction-status-card');
    if (statusCard) statusCard.classList.add('hidden');
}

async function loadEntryToEdit(entryId) {
    try {
        const resp = await apiClient.getEntry(entryId);
        if (resp && resp.success && resp.entry) {
            populateFormWithExtractedData(resp.entry);
            switchMainTab('upload');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (e) {
        alert("Erro ao carregar dados do registro: " + e.message);
    }
}

// ==============================================================================
// PARAMETRIC BUDGET ESTIMATOR
// ==============================================================================
function switchEstimatorCategory(cat) {
    currentEstimateCategory = cat;
    const btnUte = document.getElementById('estimator-type-ute');
    const btnLt = document.getElementById('estimator-type-lt');
    const panelUte = document.getElementById('estimator-controls-ute');
    const panelLt = document.getElementById('estimator-controls-lt');

    if (cat === 'termoeletrica') {
        btnUte.className = "px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white transition-all";
        btnLt.className = "px-4 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all";
        panelUte.classList.remove('hidden');
        panelLt.classList.add('hidden');
    } else {
        btnLt.className = "px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white transition-all";
        btnUte.className = "px-4 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all";
        panelLt.classList.remove('hidden');
        panelUte.classList.add('hidden');
    }

    calculateBudgetEstimate();
}

async function calculateBudgetEstimate() {
    const params = {
        category: currentEstimateCategory,
        prices: {
            concrete_m3: parseFloat(getVal('est-price-concrete')) || 550,
            steel_kg: parseFloat(getVal('est-price-steel')) || 10.50,
            formwork_m2: parseFloat(getVal('est-price-form')) || 95,
            bdi_percent: parseFloat(getVal('est-bdi')) || 22
        },
        bdi: parseFloat(getVal('est-bdi')) || 22
    };

    if (currentEstimateCategory === 'termoeletrica') {
        params.tg_count = parseInt(getVal('est-ute-tg')) || 0;
        params.hrsg_count = parseInt(getVal('est-ute-hrsg')) || 0;
        params.tr_count = parseInt(getVal('est-ute-tr')) || 0;
        params.stack_count = parseInt(getVal('est-ute-stack')) || 0;
        params.pipe_rack_m = parseFloat(getVal('est-ute-piperack')) || 0;
    } else {
        params.ts_count = parseInt(getVal('est-lt-ts')) || 0;
        params.ta_count = parseInt(getVal('est-lt-ta')) || 0;
        params.gr_count = parseInt(getVal('est-lt-gr')) || 0;
        params.tb_count = parseInt(getVal('est-lt-tb')) || 0;
    }

    try {
        const resp = await apiClient.runEstimate(params);
        if (resp && resp.success && resp.estimate) {
            renderEstimateResults(resp.estimate);
        }
    } catch (e) {
        console.error("Erro ao calcular estimativa:", e);
    }
}

function renderEstimateResults(est) {
    const s = est.summary;
    document.getElementById('est-result-title').textContent = `Estimativa: ${est.category_label}`;
    document.getElementById('est-total-vol').textContent = `${(s.total_concrete_m3 || 0).toLocaleString('pt-BR')} m³`;
    document.getElementById('est-total-steel').textContent = `${(s.total_steel_kg || 0).toLocaleString('pt-BR')} kg`;
    document.getElementById('est-total-form').textContent = `${(s.total_formwork_m2 || 0).toLocaleString('pt-BR')} m²`;
    document.getElementById('est-total-cost').textContent = `R$ ${(s.grand_total_brl || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const tbody = document.getElementById('estimate-breakdown-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    (est.breakdown || []).forEach(b => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40";
        tr.innerHTML = `
            <td class="p-2 font-bold">${b.item_name}</td>
            <td class="p-2 text-center font-bold text-slate-500">${b.count}</td>
            <td class="p-2 text-right font-semibold text-blue-600 dark:text-blue-400">${b.total_concrete_m3.toLocaleString('pt-BR')}</td>
            <td class="p-2 text-right font-semibold text-amber-600 dark:text-amber-400">${b.total_steel_kg.toLocaleString('pt-BR')}</td>
            <td class="p-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">${b.steel_ratio_kg_m3.toLocaleString('pt-BR')}</td>
            <td class="p-2 text-right font-bold text-slate-900 dark:text-slate-100">R$ ${b.estimated_cost_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==============================================================================
// DETAIL MODAL & ACTIONS
// ==============================================================================
async function openDetailModal(entryId) {
    const modal = document.getElementById('entry-detail-modal');
    const body = document.getElementById('modal-body-content');
    const title = document.getElementById('modal-title');
    const subtitle = document.getElementById('modal-subtitle');
    const btnEdit = document.getElementById('modal-btn-edit');
    const btnDelete = document.getElementById('modal-btn-delete');
    const btnOpenPdf = document.getElementById('modal-btn-open-pdf');
    const btnOpenSp = document.getElementById('modal-btn-open-sp');
    const btnToggleVerify = document.getElementById('modal-btn-toggle-verify');
    const lblVerify = document.getElementById('modal-verify-label');

    if (!modal) return;

    try {
        const resp = await apiClient.getEntry(entryId);
        if (!resp || !resp.success || !resp.entry) return;
        const e = resp.entry;

        title.textContent = e.equipment_name;
        const docTypeLabels = {
            'desenho': '📐 Desenho / Prancha',
            'memorial_calculo': '📑 Memorial de Cálculo',
            'croqui': '✏️ Croqui / Esboço',
            'relatorio_tecnico': '📋 Relatório Técnico',
            'especificacao_tecnica': '📜 Especificação / Critério',
            'quantitativo_material': '📊 Quantitativo de Materiais',
            'outro': '📁 Documento'
        };
        const dtLabel = docTypeLabels[e.doc_type] || '📐 Desenho / Prancha';
        subtitle.textContent = `${dtLabel} • ${e.project_name} • ${e.drawing_code || 'S/N'} Rev. ${e.revision || '0'}`;

        btnEdit.onclick = () => {
            closeDetailModal();
            loadEntryToEdit(entryId);
        };

        btnDelete.onclick = async () => {
            if (confirm(`Tem certeza que deseja excluir o registro de "${e.equipment_name}"?`)) {
                await apiClient.deleteEntry(entryId);
                closeDetailModal();
                loadRepositoryEntries();
            }
        };

        if (btnOpenPdf) {
            btnOpenPdf.onclick = () => openDrawingFile(entryId);
        }

        if (btnOpenSp) {
            btnOpenSp.onclick = () => {
                if (e.sharepoint_url) {
                    window.open(e.sharepoint_url, '_blank');
                } else {
                    alert('Nenhum link do SharePoint cadastrado para esta prancha. Você pode adicionar clicando em Editar.');
                }
            };
        }

        if (btnToggleVerify && lblVerify) {
            const isPending = e.review_status === 'pending_review';
            lblVerify.textContent = isPending ? 'Marcar como Verificado' : 'Reabrir Verificação';
            btnToggleVerify.className = isPending
                ? "px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all text-xs flex items-center gap-1.5 shadow-sm"
                : "px-3.5 py-2 rounded-xl border border-amber-400 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 font-bold transition-all text-xs flex items-center gap-1.5";
            btnToggleVerify.onclick = () => toggleModalReviewStatus(entryId);
        }

        let itemsHtml = '';
        (e.line_items || []).forEach(it => {
            itemsHtml += `
                <tr class="border-b border-[var(--color-border-primary)]">
                    <td class="p-2 font-bold">${escapeHtml(it.item)}</td>
                    <td class="p-2 text-slate-400">${escapeHtml(it.spec || '-')}</td>
                    <td class="p-2 text-center font-bold">${escapeHtml(it.unit || '')}</td>
                    <td class="p-2 text-right font-bold">${(it.quantity || 0).toLocaleString('pt-BR')}</td>
                    <td class="p-2 text-slate-400 text-[11px]">${escapeHtml(it.notes || '-')}</td>
                </tr>
            `;
        });

        const isPending = e.review_status === 'pending_review';
        const statusBanner = isPending
            ? `<div class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex items-center gap-2.5">
                    <span class="text-xl">⚠️</span>
                    <div>
                        <div class="font-bold text-xs">Registro Aguardando Verificação da Engenharia</div>
                        <p class="text-[11px] text-amber-700 dark:text-amber-300">Este quantitativo foi extraído automaticamente. Abra o PDF para conferir as medidas e aprove.</p>
                    </div>
                </div>
                <button onclick="toggleModalReviewStatus('${e.id}')"
                    class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs shrink-0 self-start sm:self-auto">
                    ✓ Aprovar Agora
                </button>
               </div>`
            : `<div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-between text-xs">
                <span class="font-bold flex items-center gap-1.5">
                    <span>✅</span>
                    <span>Registro Conferido & Validado</span>
                </span>
                <span class="text-[11px] text-emerald-600 dark:text-emerald-400">Pronto para orçamentos e relatórios</span>
               </div>`;

        body.innerHTML = `
            ${statusBanner}

            <!-- Source File & Origin Card -->
            <div class="p-3.5 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] space-y-2">
                <div class="flex items-center justify-between">
                    <span class="text-[10px] uppercase font-bold text-slate-400">Origem do Documento</span>
                    <button onclick="openDrawingFile('${e.id}')" class="text-blue-600 dark:text-blue-400 hover:underline font-bold text-xs flex items-center gap-1">
                        <span>📄 Abrir no Leitor de PDF</span>
                    </button>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                        <span class="text-slate-400 block text-[10px]">Arquivo da Prancha:</span>
                        <span class="font-bold text-[var(--color-text-primary)] font-mono">${escapeHtml(e.drawing_filename || 'Identificado na obra')}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px]">Caminho no OneDrive / Pasta:</span>
                        <span class="text-[11px] text-slate-600 dark:text-slate-300 truncate block font-mono" title="${escapeHtml(e.relative_path || e.source_folder || '')}">
                            ${escapeHtml(e.relative_path || e.source_folder || 'Salvo no banco de dados')}
                        </span>
                    </div>
                </div>
                ${e.sharepoint_url ? `
                <div class="pt-1 border-t border-[var(--color-border-primary)] text-[11px]">
                    <span class="text-slate-400">Link Web SharePoint: </span>
                    <a href="${escapeHtml(e.sharepoint_url)}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline break-all font-mono">
                        ${escapeHtml(e.sharepoint_url)}
                    </a>
                </div>` : ''}
            </div>

            <!-- Totals Matrix -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)]">
                <div>
                    <span class="text-[10px] text-slate-400 uppercase font-bold block">Concreto</span>
                    <span class="font-extrabold text-blue-600">${(e.concrete_volume_m3 || 0).toLocaleString('pt-BR')} m³</span>
                </div>
                <div>
                    <span class="text-[10px] text-slate-400 uppercase font-bold block">Aço CA-50</span>
                    <span class="font-extrabold text-amber-600">${(e.steel_weight_kg || 0).toLocaleString('pt-BR')} kg</span>
                </div>
                <div>
                    <span class="text-[10px] text-slate-400 uppercase font-bold block">Taxa de Armadura</span>
                    <span class="font-extrabold text-emerald-600">${(e.steel_ratio_kg_m3 || 0).toLocaleString('pt-BR')} kg/m³</span>
                </div>
                <div>
                    <span class="text-[10px] text-slate-400 uppercase font-bold block">Fôrma</span>
                    <span class="font-extrabold text-purple-600">${(e.formwork_area_m2 || 0).toLocaleString('pt-BR')} m²</span>
                </div>
            </div>

            <div>
                <h4 class="font-bold text-slate-700 dark:text-slate-200 mb-2">Tabela de Materiais</h4>
                <div class="overflow-x-auto border border-[var(--color-border-primary)] rounded-xl">
                    <table class="w-full text-left text-xs">
                        <thead>
                            <tr class="bg-slate-100 dark:bg-slate-800 text-slate-500">
                                <th class="p-2">Material</th>
                                <th class="p-2">Especificação</th>
                                <th class="p-2 text-center">Unidade</th>
                                <th class="p-2 text-right">Quantidade</th>
                                <th class="p-2">Obs</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml || '<tr><td colspan="5" class="p-3 text-center text-slate-400">Nenhum item discriminado</td></tr>'}</tbody>
                    </table>
                </div>
            </div>

            ${e.notes ? `<div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-[var(--color-border-primary)] text-[11px]"><b class="block mb-1">Notas:</b>${escapeHtml(e.notes)}</div>` : ''}
        `;

        modal.classList.remove('hidden');
    } catch (err) {
        console.error("Erro no modal:", err);
    }
}

function closeDetailModal() {
    const modal = document.getElementById('entry-detail-modal');
    if (modal) modal.classList.add('hidden');
}

async function openDrawingFile(entryId) {
    try {
        const resp = await apiClient.openDrawing(entryId);
        if (resp && resp.success) {
            if (resp.opened === 'local') {
                console.log("Arquivo aberto localmente:", resp.path);
            } else if (resp.opened === 'sharepoint') {
                console.log("Link do SharePoint aberto:", resp.url);
            }
        } else {
            alert(resp ? resp.error : "Não foi possível abrir o arquivo da prancha.");
        }
    } catch (e) {
        alert("Erro ao abrir arquivo: " + e.message);
    }
}

async function toggleModalReviewStatus(entryId) {
    try {
        const resp = await apiClient.getEntry(entryId);
        if (!resp || !resp.success || !resp.entry) return;
        const current = resp.entry.review_status || 'verified';
        const nextStatus = current === 'pending_review' ? 'verified' : 'pending_review';

        const updateResp = await apiClient.updateReviewStatus(entryId, nextStatus);
        if (updateResp && updateResp.success) {
            await openDetailModal(entryId);
            await loadRepositoryEntries();
        }
    } catch (e) {
        alert("Erro ao alterar status: " + e.message);
    }
}

// ==============================================================================
// BATCH FOLDER SCANNER (ONEDRIVE / NETWORK)
// ==============================================================================
let detectedOneDriveRootPath = '';

async function initOneDriveHint() {
    try {
        const resp = await apiClient.getDefaultOneDrivePath();
        if (resp && resp.success && resp.onedrive_root) {
            detectedOneDriveRootPath = resp.onedrive_root;
            const hint = document.getElementById('detected-onedrive-hint');
            if (hint) {
                hint.textContent = `OneDrive Detectado: ${resp.onedrive_root}`;
            }
            const input = document.getElementById('batch-folder-input');
            if (input && !input.value) {
                input.value = resp.onedrive_root;
            }
        }
    } catch (e) {
        console.warn("Could not detect OneDrive path:", e);
    }
}

function autoDetectCategoryFromPath(path) {
    if (!path) return;
    const p = path.toLowerCase();
    const sel = document.getElementById('batch-default-category');
    if (!sel) return;
    if (p.includes('transmissao') || p.includes('linha') || p.includes('lt ') || p.includes('lt-') || p.includes('subestacao')) {
        sel.value = 'linha_transmissao';
    } else if (p.includes('ute') || p.includes('termo') || p.includes('turbogerador') || p.includes('caldeira')) {
        sel.value = 'termoeletrica';
    }
}

async function browseBatchFolder() {
    try {
        const current = document.getElementById('batch-folder-input')?.value || detectedOneDriveRootPath;
        const resp = await apiClient.browseFolderDialog(current);
        if (resp && resp.success && resp.selected_path) {
            document.getElementById('batch-folder-input').value = resp.selected_path;
            autoDetectCategoryFromPath(resp.selected_path);
        }
    } catch (e) {
        alert("Erro ao selecionar pasta: " + e.message);
    }
}

function useDefaultOneDriveFolder() {
    if (detectedOneDriveRootPath) {
        document.getElementById('batch-folder-input').value = detectedOneDriveRootPath;
    } else {
        alert("Caminho padrão do OneDrive não foi detectado automaticamente. Por favor, cole o caminho da pasta.");
    }
}

async function startBatchScan() {
    const folderInput = document.getElementById('batch-folder-input');
    const folderPath = folderInput ? folderInput.value.trim() : '';

    if (!folderPath) {
        alert("Por favor, selecione ou digite o caminho da pasta no OneDrive.");
        return;
    }

    const recursive = document.getElementById('batch-opt-recursive')?.checked ?? true;
    const skipExisting = document.getElementById('batch-opt-skip')?.checked ?? true;
    const category = document.getElementById('batch-default-category')?.value || 'termoeletrica';
    const keywordFilter = document.getElementById('batch-filter-keyword')?.value?.trim() || null;
    const focusCivil = document.getElementById('batch-opt-focus-civil')?.checked ?? true;
    const docTypeFilter = document.getElementById('batch-doc-type-filter')?.value || 'todas';
    
    const maxFilesVal = parseInt(document.getElementById('batch-max-files')?.value || '0', 10);
    const maxFiles = maxFilesVal > 0 ? maxFilesVal : null;

    const btnStart = document.getElementById('btn-start-batch-scan');
    const btnCancel = document.getElementById('btn-cancel-batch-scan');
    const progressCard = document.getElementById('batch-progress-card');
    const summaryCard = document.getElementById('batch-summary-card');
    const logBox = document.getElementById('batch-log-container');

    if (btnStart) btnStart.disabled = true;
    if (btnCancel) {
        btnCancel.classList.remove('hidden');
        btnCancel.textContent = "⏹️ Interromper Varredura";
        btnCancel.disabled = false;
    }
    if (progressCard) progressCard.classList.remove('hidden');
    if (summaryCard) summaryCard.classList.add('hidden');
    if (logBox) {
        logBox.innerHTML = recursive
            ? '<div class="text-blue-500 font-bold">Iniciando busca recursiva em todas as subpastas da árvore...</div>'
            : '<div class="text-amber-500 font-bold">⚠️ Atenção: Varredura apenas na pasta raiz (subpastas serão ignoradas).</div>';
    }

    updateBatchProgressUI(0, `Iniciando mapeamento na pasta: ${folderPath}...`, null);

    try {
        const resp = await apiClient.batchScan(
            folderPath, 
            recursive, 
            category, 
            skipExisting, 
            keywordFilter, 
            focusCivil, 
            maxFiles,
            docTypeFilter
        );

        // If returned synchronously (HTTP mode or instant result), handle finish directly
        if (resp && resp.started) {
            // Background thread launched in Eel, progress and finish will be handled by callbacks
        } else if (resp) {
            handleBatchScanFinished(resp);
        }
    } catch (e) {
        alert("Erro ao executar varredura: " + e.message);
        if (btnStart) btnStart.disabled = false;
        if (btnCancel) btnCancel.classList.add('hidden');
    }
}

async function cancelBatchScan() {
    const btnCancel = document.getElementById('btn-cancel-batch-scan');
    if (btnCancel) {
        btnCancel.textContent = "⏳ Interrompendo...";
        btnCancel.disabled = true;
    }
    try {
        await apiClient.cancelBatchScan();
    } catch (e) {
        console.error("Erro ao cancelar varredura:", e);
    }
}

function handleBatchScanFinished(resp) {
    const btnStart = document.getElementById('btn-start-batch-scan');
    const btnCancel = document.getElementById('btn-cancel-batch-scan');
    const summaryCard = document.getElementById('batch-summary-card');

    if (btnStart) btnStart.disabled = false;
    if (btnCancel) btnCancel.classList.add('hidden');

    if (resp && resp.success) {
        const isCancelled = resp.cancelled;
        let msg = resp.message || (isCancelled 
            ? `Varredura interrompida pelo usuário! ${resp.imported || 0} pranchas foram cadastradas e salvas.`
            : `Varredura concluída! ${resp.imported || 0} pranchas cadastradas.`);

        if (resp.total_found === 0 && resp.has_subdirs) {
            // Auto-check recursive for convenience and inform
            const recEl = document.getElementById('batch-opt-recursive');
            if (recEl) {
                recEl.checked = true;
            }
            msg = resp.message || "0 arquivos na raiz. Subpastas detectadas! A opção 'Varredura recursiva' foi marcada automaticamente para você poder iniciar novamente.";
        }

        updateBatchProgressUI(100, msg, null);

        // Populate summary card
        document.getElementById('batch-sum-found').textContent = resp.total_found || 0;
        document.getElementById('batch-sum-imported').textContent = resp.imported || 0;
        document.getElementById('batch-sum-skipped').textContent = resp.skipped || 0;
        document.getElementById('batch-sum-pending').textContent = resp.imported || 0;

        const badge = document.getElementById('batch-summary-badge');
        if (badge) {
            badge.textContent = isCancelled ? "Interrompido (Dados Parciais Salvos)" : "Pronto para Conferência";
            badge.className = isCancelled 
                ? "px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200"
                : "px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200";
        }

        if (summaryCard) summaryCard.classList.remove('hidden');
        loadRepositoryEntries();
    } else {
        alert("Erro durante a varredura: " + (resp ? resp.error : "Falha desconhecida"));
    }
}

function updateBatchProgressUI(pct, msg, currentEntry) {
    const bar = document.getElementById('batch-progress-bar');
    const pctLabel = document.getElementById('batch-progress-pct');
    const msgLabel = document.getElementById('batch-progress-msg');
    const logBox = document.getElementById('batch-log-container');

    if (bar) bar.style.width = `${pct}%`;
    if (pctLabel) pctLabel.textContent = `${pct}%`;
    if (msgLabel) msgLabel.textContent = msg;

    if (logBox) {
        if (currentEntry) {
            const logLine = document.createElement('div');
            logLine.className = "flex items-center justify-between py-1 px-2 mb-1 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs";
            logLine.innerHTML = `
                <span class="font-medium">📄 ${escapeHtml(currentEntry.code || 'Prancha')} - ${escapeHtml(currentEntry.equipment || '')}</span>
                <span class="text-blue-600 dark:text-blue-400 font-bold">${currentEntry.vol || 0} m³</span>
            `;
            logBox.appendChild(logLine);
            logBox.scrollTop = logBox.scrollHeight;
        } else if (msg) {
            // Avoid duplicate successive messages
            const lastLog = logBox.lastElementChild;
            const logText = `[${pct}%] ${msg}`;
            if (!lastLog || lastLog.textContent !== logText) {
                const logLine = document.createElement('div');
                logLine.className = "text-slate-400 dark:text-slate-500 text-xs py-0.5 font-mono";
                logLine.textContent = logText;
                logBox.appendChild(logLine);
                logBox.scrollTop = logBox.scrollHeight;
            }
        }
    }
}

function goToRepoAndFilterPending() {
    switchMainTab('repo');
    setReviewFilter('pending_review');
    window.scrollTo({ top: 300, behavior: 'smooth' });
}

// ==============================================================================
// EXCEL EXPORT
// ==============================================================================
async function downloadExcelExport() {
    try {
        const resp = await apiClient.exportExcel(activeCategory);
        if (resp && resp.success && resp.base64) {
            const byteCharacters = atob(resp.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = resp.filename || 'Quantitativos_Fundações.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    } catch (e) {
        alert("Erro ao exportar Excel: " + e.message);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

