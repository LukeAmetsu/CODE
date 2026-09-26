/**
 * Central PDF Studio Frontend Logic
 * Supports Merge, Split, Organize & Rotate, Compress, Unlock, Protect, Sign & Stamp, PDF to Images, Images to PDF.
 */

// Global State
let currentTool = 'merge';
let uploadedFiles = []; // For merge and img_to_pdf: array of { file, name, size, dataUrl, pageCount, ranges, etc. }
let currentDocument = null; // For single doc tools: { file, name, size, dataUrl, isEncrypted, pageCount, pages: [] }
let organizePages = []; // [{ source_index, page_num, thumbnail, rotation, delete }]
let signatureData = {
    mode: 'draw', // 'draw', 'type', 'upload'
    canvas: null,
    ctx: null,
    isDrawing: false,
    penColor: '#000000',
    penWidth: 2,
    typedText: '',
    uploadedImageBase64: null,
    targetPageIndex: 0,
    placedX: 65, // % from left
    placedY: 82, // % from top
    placedW: 25, // % width
    placedH: 10  // % height
};

const TOOL_CONFIGS = {
    merge: {
        title: 'Juntar Arquivos PDF (Merge)',
        desc: 'Combine múltiplos documentos PDF em um único arquivo organizado.',
        icon: '📑',
        accept: '.pdf',
        multiple: true,
        executeText: 'Mesclar PDFs'
    },
    split: {
        title: 'Dividir PDF (Split)',
        desc: 'Separe páginas avulsas, intervalos específicos ou divida em arquivos individuais.',
        icon: '✂️',
        accept: '.pdf',
        multiple: false,
        executeText: 'Dividir PDF'
    },
    organize: {
        title: 'Organizar & Girar Páginas',
        desc: 'Reordene, gire em 90° e exclua páginas visualmente.',
        icon: '🔄',
        accept: '.pdf',
        multiple: false,
        executeText: 'Salvar Organização'
    },
    compress: {
        title: 'Comprimir PDF',
        desc: 'Reduza o tamanho do arquivo PDF mantendo a máxima qualidade de leitura.',
        icon: '📉',
        accept: '.pdf',
        multiple: false,
        executeText: 'Comprimir PDF'
    },
    unlock: {
        title: 'Remover Senha do PDF',
        desc: 'Desproteja e remova senhas de abertura de arquivos PDF confidenciais.',
        icon: '🔓',
        accept: '.pdf',
        multiple: false,
        executeText: 'Desbloquear PDF'
    },
    protect: {
        title: 'Adicionar Senha & Criptografia',
        desc: 'Proteja seu documento PDF com criptografia de alto nível AES-256.',
        icon: '🔒',
        accept: '.pdf',
        multiple: false,
        executeText: 'Proteger PDF'
    },
    sign: {
        title: 'Assinar & Carimbar PDF',
        desc: 'Desenhe sua assinatura, digite com caligrafia elegante ou aplique seu carimbo visual.',
        icon: '✍️',
        accept: '.pdf',
        multiple: false,
        executeText: 'Aplicar Assinatura & Salvar'
    },
    pdf_to_img: {
        title: 'Converter PDF para Imagens',
        desc: 'Converta páginas do PDF em imagens de alta resolução (PNG ou JPG).',
        icon: '🖼️',
        accept: '.pdf',
        multiple: false,
        executeText: 'Converter em Imagens'
    },
    img_to_pdf: {
        title: 'Converter Imagens para PDF',
        desc: 'Transforme fotos e imagens (JPG, PNG, WEBP) em um documento PDF consolidado.',
        icon: '📄',
        accept: '.jpg,.jpeg,.png,.webp',
        multiple: true,
        executeText: 'Criar Documento PDF'
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Check URL query parameters for initial tool
    const urlParams = new URLSearchParams(window.location.search);
    const initialTool = urlParams.get('tool');
    if (initialTool && TOOL_CONFIGS[initialTool]) {
        selectTool(initialTool);
    } else {
        selectTool('merge');
    }
});

// Tool Selection
function selectTool(toolKey) {
    if (!TOOL_CONFIGS[toolKey]) return;
    currentTool = toolKey;

    // Update active tab buttons
    document.querySelectorAll('.tool-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-${toolKey}`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update Header
    const cfg = TOOL_CONFIGS[toolKey];
    document.getElementById('tool-title').innerText = cfg.title;
    document.getElementById('tool-desc').innerText = cfg.desc;
    document.getElementById('tool-icon').innerText = cfg.icon;
    document.getElementById('execute-text').innerText = cfg.executeText;

    // Reset workspace state
    resetWorkspace();

    // Adjust file input accept & multiple attributes
    const fileInput = document.getElementById('file-input');
    fileInput.accept = cfg.accept;
    fileInput.multiple = cfg.multiple;

    const hint = document.getElementById('dropzone-hint');
    if (cfg.multiple) {
        hint.innerText = 'Você pode selecionar múltiplos arquivos simultaneamente.';
    } else {
        hint.innerText = 'Selecione um arquivo PDF para carregar e inspecionar.';
    }
}

// Reset Workspace
function resetWorkspace() {
    uploadedFiles = [];
    currentDocument = null;
    organizePages = [];
    document.getElementById('dropzone').classList.remove('hidden');
    document.getElementById('tool-workspace').classList.add('hidden');
    document.getElementById('result-box').classList.add('hidden');
    document.getElementById('tool-content').innerHTML = '';
    document.getElementById('btn-add-more').classList.add('hidden');
    document.getElementById('process-info').innerHTML = '';
    document.getElementById('tool-top-actions').innerHTML = '';
}

// File Selection / Dropzone Handling
function triggerFileInput() {
    const fileInput = document.getElementById('file-input');
    fileInput.value = '';
    fileInput.click();
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropzone').classList.add('dropzone-active');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropzone').classList.remove('dropzone-active');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropzone').classList.remove('dropzone-active');
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        processIncomingFiles(e.dataTransfer.files);
    }
}

function handleFileInput(e) {
    if (e.target.files && e.target.files.length > 0) {
        processIncomingFiles(e.target.files);
    }
}

async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Process Files depending on Tool
async function processIncomingFiles(fileList) {
    showLoading('Carregando e analisando arquivo(s)...', 'Lendo páginas e gerando miniaturas visuais...');

    try {
        const cfg = TOOL_CONFIGS[currentTool];

        if (currentTool === 'merge') {
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                if (!file.name.toLowerCase().endsWith('.pdf')) continue;
                const dataUrl = await readFileAsDataUrl(file);
                
                // Inspect page count if eel is available
                let pageCount = 1;
                if (window.eel && eel.pdf_inspect_doc) {
                    try {
                        const insp = await eel.pdf_inspect_doc(dataUrl)();
                        if (insp && insp.status === 'success') {
                            pageCount = insp.page_count;
                        }
                    } catch (err) {
                        console.warn('Inspect error:', err);
                    }
                }

                uploadedFiles.push({
                    id: Date.now() + '_' + i,
                    file: file,
                    name: file.name,
                    size: file.size,
                    dataUrl: dataUrl,
                    pageCount: pageCount,
                    ranges: 'all'
                });
            }
            renderMergeView();

        } else if (currentTool === 'img_to_pdf') {
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                const ext = file.name.split('.').pop().toLowerCase();
                if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) continue;
                const dataUrl = await readFileAsDataUrl(file);
                uploadedFiles.push({
                    id: Date.now() + '_' + i,
                    file: file,
                    name: file.name,
                    size: file.size,
                    dataUrl: dataUrl
                });
            }
            renderImagesToPdfView();

        } else {
            // Single Document Tools: split, organize, compress, unlock, protect, sign, pdf_to_img
            const file = fileList[0];
            if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
                alert('Por favor, selecione um arquivo no formato PDF.');
                hideLoading();
                return;
            }

            const dataUrl = await readFileAsDataUrl(file);
            let insp = null;

            if (window.eel && eel.pdf_inspect_doc) {
                insp = await eel.pdf_inspect_doc(dataUrl)();
            } else {
                // Fallback mock if eel not yet loaded
                insp = {
                    status: 'success',
                    page_count: 1,
                    file_size: file.size,
                    is_encrypted: false,
                    pages: [{ page_index: 0, page_num: 1, thumbnail: '' }]
                };
            }

            if (insp.status === 'error') {
                alert(`Aviso: ${insp.message}`);
                hideLoading();
                return;
            }

            currentDocument = {
                file: file,
                name: file.name,
                size: file.size,
                dataUrl: dataUrl,
                isEncrypted: insp.is_encrypted,
                needsPassword: insp.needs_password,
                pageCount: insp.page_count,
                metadata: insp.metadata || {},
                pages: insp.pages || []
            };

            // Dispatch to specific tool view
            if (currentTool === 'split') renderSplitView();
            else if (currentTool === 'organize') renderOrganizeView();
            else if (currentTool === 'compress') renderCompressView();
            else if (currentTool === 'unlock') renderUnlockView();
            else if (currentTool === 'protect') renderProtectView();
            else if (currentTool === 'sign') renderSignView();
            else if (currentTool === 'pdf_to_img') renderPdfToImgView();
        }

        // Show workspace, hide initial dropzone
        document.getElementById('dropzone').classList.add('hidden');
        document.getElementById('tool-workspace').classList.remove('hidden');

    } catch (e) {
        console.error(e);
        alert(`Ocorreu um erro ao carregar o arquivo: ${e.message || e}`);
    } finally {
        hideLoading();
    }
}

// ----------------------------------------------------------------------------------
// 1. MERGE VIEW
// ----------------------------------------------------------------------------------
function renderMergeView() {
    const container = document.getElementById('tool-content');
    document.getElementById('btn-add-more').classList.remove('hidden');

    if (uploadedFiles.length === 0) {
        resetWorkspace();
        return;
    }

    let html = `
        <div class="space-y-3">
            <div class="flex items-center justify-between text-xs font-semibold text-[var(--color-text-secondary)] px-1">
                <span>Ordem dos Arquivos (arraste ou use as setas para reorganizar)</span>
                <span>${uploadedFiles.length} documento(s)</span>
            </div>
            <div id="merge-list" class="space-y-2">
    `;

    uploadedFiles.forEach((item, index) => {
        html += `
            <div class="flex items-center justify-between p-3.5 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:border-blue-400 transition-all shadow-2xs gap-3">
                <div class="flex items-center gap-3 overflow-hidden">
                    <span class="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0">
                        ${index + 1}
                    </span>
                    <div class="truncate">
                        <div class="text-xs md:text-sm font-bold text-[var(--color-text-primary)] truncate">${item.name}</div>
                        <div class="text-[11px] text-[var(--color-text-secondary)]">
                            ${formatBytes(item.size)} • ${item.pageCount} pág(s)
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                    <div class="flex items-center gap-1.5 text-xs">
                        <span class="text-[11px] text-[var(--color-text-secondary)] hidden sm:inline">Páginas:</span>
                        <input type="text" value="${item.ranges}" placeholder="all ou 1-3, 5" onchange="updateMergeRange(${index}, this.value)"
                            class="w-24 px-2 py-1 rounded-lg text-xs border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)] focus:ring-1 focus:ring-blue-500 text-center font-mono">
                    </div>
                    <div class="flex items-center border border-[var(--color-border-primary)] rounded-lg overflow-hidden">
                        <button onclick="moveMergeFile(${index}, -1)" ${index === 0 ? 'disabled' : ''} class="px-2 py-1 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-30 text-xs">▲</button>
                        <button onclick="moveMergeFile(${index}, 1)" ${index === uploadedFiles.length - 1 ? 'disabled' : ''} class="px-2 py-1 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-30 text-xs border-l border-[var(--color-border-primary)]">▼</button>
                    </div>
                    <button onclick="removeMergeFile(${index})" class="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-all" title="Remover">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
    updateProcessInfo();
}

function updateMergeRange(index, val) {
    if (uploadedFiles[index]) uploadedFiles[index].ranges = val.trim() || 'all';
}

function moveMergeFile(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= uploadedFiles.length) return;
    const temp = uploadedFiles[index];
    uploadedFiles[index] = uploadedFiles[target];
    uploadedFiles[target] = temp;
    renderMergeView();
}

function removeMergeFile(index) {
    uploadedFiles.splice(index, 1);
    renderMergeView();
}

// ----------------------------------------------------------------------------------
// 2. SPLIT VIEW
// ----------------------------------------------------------------------------------
let splitMode = 'extract'; // 'extract', 'separate', 'by_interval'
let splitSelectedPages = new Set();

function renderSplitView() {
    const container = document.getElementById('tool-content');
    splitSelectedPages.clear();
    // Default select first page
    splitSelectedPages.add(0);

    let html = `
        <div class="space-y-6">
            <!-- Mode Switcher -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button type="button" onclick="setSplitMode('extract')" id="split-mode-extract"
                    class="p-3 rounded-xl border-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-left transition-all">
                    <div class="font-bold text-xs md:text-sm text-blue-600 dark:text-blue-400">1. Extrair Páginas</div>
                    <div class="text-[11px] text-[var(--color-text-secondary)] mt-0.5">Selecione intervalos (ex: 1-3, 5) em um único PDF</div>
                </button>
                <button type="button" onclick="setSplitMode('separate')" id="split-mode-separate"
                    class="p-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-left hover:border-blue-400 transition-all">
                    <div class="font-bold text-xs md:text-sm text-[var(--color-text-primary)]">2. Separar Todas as Páginas</div>
                    <div class="text-[11px] text-[var(--color-text-secondary)] mt-0.5">Salva cada página como um arquivo avulso (ZIP)</div>
                </button>
                <button type="button" onclick="setSplitMode('by_interval')" id="split-mode-by_interval"
                    class="p-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-left hover:border-blue-400 transition-all">
                    <div class="font-bold text-xs md:text-sm text-[var(--color-text-primary)]">3. Dividir em Blocos Fixos</div>
                    <div class="text-[11px] text-[var(--color-text-secondary)] mt-0.5">Gera partes a cada N páginas (ex: a cada 2)</div>
                </button>
            </div>

            <!-- Parameters panel based on mode -->
            <div id="split-params" class="p-4 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <span class="text-xs font-semibold text-[var(--color-text-primary)]">Intervalo de Páginas:</span>
                    <input type="text" id="split-range-input" value="1" oninput="onSplitRangeInput(this.value)"
                        placeholder="Ex: 1-3, 5, 8" class="px-3 py-1.5 rounded-lg text-xs border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)] focus:ring-2 focus:ring-blue-500 font-mono w-48">
                    <span class="text-[11px] text-[var(--color-text-secondary)]">(ou clique nas miniaturas abaixo)</span>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="selectAllSplitPages(true)" class="text-xs px-2.5 py-1 rounded-md bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border-primary)]">Selecionar Todas</button>
                    <button type="button" onclick="selectAllSplitPages(false)" class="text-xs px-2.5 py-1 rounded-md bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border-primary)]">Limpar</button>
                </div>
            </div>

            <!-- Visual Page Thumbnails Grid -->
            <div>
                <div class="text-xs font-semibold text-[var(--color-text-secondary)] mb-3">
                    Clique nas miniaturas para incluir ou remover da extração:
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-[52vh] overflow-y-auto p-2 border border-[var(--color-border-primary)] rounded-xl bg-[var(--color-bg-primary)]">
    `;

    currentDocument.pages.forEach((pg) => {
        const isSelected = splitSelectedPages.has(pg.page_index);
        html += `
            <div id="split-thumb-${pg.page_index}" onclick="toggleSplitPage(${pg.page_index})"
                class="page-card cursor-pointer rounded-xl border-2 ${isSelected ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/40 shadow-md ring-2 ring-blue-500/30' : 'border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] opacity-70 hover:opacity-100'} p-2 flex flex-col items-center gap-2 text-center transition-all select-none">
                <div class="relative w-full aspect-[1/1.4] bg-white rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-center">
                    ${pg.thumbnail ? `<img src="${pg.thumbnail}" class="w-full h-full object-contain pointer-events-none" />` : `<span class="text-xs text-slate-400">Pág ${pg.page_num}</span>`}
                    <div class="absolute top-1 right-1 w-5 h-5 rounded-full ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-300 dark:bg-slate-700 text-transparent'} flex items-center justify-center text-[10px] font-bold shadow-xs">
                        ✓
                    </div>
                </div>
                <span class="text-[11px] font-bold ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--color-text-secondary)]'}">
                    Página ${pg.page_num}
                </span>
            </div>
        `;
    });

    html += `
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    updateProcessInfo();
}

function setSplitMode(mode) {
    splitMode = mode;
    ['extract', 'separate', 'by_interval'].forEach(m => {
        const btn = document.getElementById(`split-mode-${m}`);
        if (!btn) return;
        if (m === mode) {
            btn.className = 'p-3 rounded-xl border-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-left transition-all';
            btn.querySelector('.font-bold').className = 'font-bold text-xs md:text-sm text-blue-600 dark:text-blue-400';
        } else {
            btn.className = 'p-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-left hover:border-blue-400 transition-all';
            btn.querySelector('.font-bold').className = 'font-bold text-xs md:text-sm text-[var(--color-text-primary)]';
        }
    });

    const paramsBox = document.getElementById('split-params');
    if (mode === 'extract') {
        paramsBox.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-xs font-semibold text-[var(--color-text-primary)]">Intervalo de Páginas:</span>
                <input type="text" id="split-range-input" value="${formatSelectedPagesToRange() || '1'}" oninput="onSplitRangeInput(this.value)"
                    placeholder="Ex: 1-3, 5, 8" class="px-3 py-1.5 rounded-lg text-xs border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)] focus:ring-2 focus:ring-blue-500 font-mono w-48">
                <span class="text-[11px] text-[var(--color-text-secondary)]">(ou clique nas miniaturas abaixo)</span>
            </div>
            <div class="flex items-center gap-2">
                <button type="button" onclick="selectAllSplitPages(true)" class="text-xs px-2.5 py-1 rounded-md bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border-primary)]">Selecionar Todas</button>
                <button type="button" onclick="selectAllSplitPages(false)" class="text-xs px-2.5 py-1 rounded-md bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border-primary)]">Limpar</button>
            </div>
        `;
    } else if (mode === 'separate') {
        paramsBox.innerHTML = `
            <div class="text-xs text-[var(--color-text-secondary)]">
                Todas as <strong>${currentDocument.pageCount} páginas</strong> serão extraídas como arquivos PDF individuais e compactadas em um arquivo ZIP.
            </div>
        `;
    } else if (mode === 'by_interval') {
        paramsBox.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-xs font-semibold text-[var(--color-text-primary)]">Dividir a cada:</span>
                <input type="number" id="split-interval-input" value="1" min="1" max="${currentDocument.pageCount}"
                    class="w-20 px-3 py-1.5 rounded-lg text-xs border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)] focus:ring-2 focus:ring-blue-500 font-bold text-center">
                <span class="text-xs text-[var(--color-text-secondary)]">página(s) por arquivo gerado.</span>
            </div>
        `;
    }
}

function toggleSplitPage(idx) {
    if (splitMode !== 'extract') {
        setSplitMode('extract');
    }
    if (splitSelectedPages.has(idx)) {
        if (splitSelectedPages.size > 1) splitSelectedPages.delete(idx);
    } else {
        splitSelectedPages.add(idx);
    }
    updateSplitThumbsUI();
    const input = document.getElementById('split-range-input');
    if (input) input.value = formatSelectedPagesToRange();
}

function selectAllSplitPages(select) {
    splitSelectedPages.clear();
    if (select) {
        for (let i = 0; i < currentDocument.pageCount; i++) splitSelectedPages.add(i);
    } else {
        splitSelectedPages.add(0);
    }
    updateSplitThumbsUI();
    const input = document.getElementById('split-range-input');
    if (input) input.value = formatSelectedPagesToRange();
}

function updateSplitThumbsUI() {
    currentDocument.pages.forEach(pg => {
        const card = document.getElementById(`split-thumb-${pg.page_index}`);
        if (!card) return;
        const isSelected = splitSelectedPages.has(pg.page_index);
        card.className = `page-card cursor-pointer rounded-xl border-2 ${isSelected ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/40 shadow-md ring-2 ring-blue-500/30' : 'border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] opacity-70 hover:opacity-100'} p-2 flex flex-col items-center gap-2 text-center transition-all select-none`;
        const check = card.querySelector('.rounded-full');
        if (check) {
            check.className = `absolute top-1 right-1 w-5 h-5 rounded-full ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-300 dark:bg-slate-700 text-transparent'} flex items-center justify-center text-[10px] font-bold shadow-xs`;
        }
    });
}

function formatSelectedPagesToRange() {
    const arr = Array.from(splitSelectedPages).sort((a, b) => a - b).map(x => x + 1);
    if (arr.length === 0) return '';
    let ranges = [];
    let start = arr[0], end = arr[0];
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] === end + 1) {
            end = arr[i];
        } else {
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = end = arr[i];
        }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(', ');
}

function onSplitRangeInput(val) {
    splitSelectedPages.clear();
    const parts = val.split(',');
    parts.forEach(p => {
        p = p.trim();
        if (p.includes('-')) {
            const sub = p.split('-');
            const s = parseInt(sub[0]);
            const e = parseInt(sub[1]);
            if (!isNaN(s) && !isNaN(e)) {
                for (let i = Math.min(s, e); i <= Math.max(s, e); i++) {
                    if (i >= 1 && i <= currentDocument.pageCount) splitSelectedPages.add(i - 1);
                }
            }
        } else {
            const num = parseInt(p);
            if (!isNaN(num) && num >= 1 && num <= currentDocument.pageCount) {
                splitSelectedPages.add(num - 1);
            }
        }
    });
    updateSplitThumbsUI();
}

// ----------------------------------------------------------------------------------
// 3. ORGANIZE & ROTATE VIEW
// ----------------------------------------------------------------------------------
let draggedPageIdx = null;

function renderOrganizeView() {
    const container = document.getElementById('tool-content');
    const topActions = document.getElementById('tool-top-actions');

    topActions.innerHTML = `
        <button type="button" onclick="rotateAllPages(90)" class="px-3 py-1.5 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-hover)] text-xs font-semibold text-[var(--color-text-primary)] transition-all flex items-center gap-1.5">
            <span>🔄</span> Girar Todas 90°
        </button>
        <button type="button" onclick="resetPageOrder()" class="px-3 py-1.5 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-hover)] text-xs font-semibold text-[var(--color-text-secondary)] transition-all">
            Resetar Ordem
        </button>
    `;

    // Initialize organizePages if not already
    if (organizePages.length === 0) {
        organizePages = currentDocument.pages.map(p => ({
            source_index: p.page_index,
            page_num: p.page_num,
            thumbnail: p.thumbnail,
            rotation: 0,
            delete: false
        }));
    }

    renderOrganizeGrid();
}

function renderOrganizeGrid() {
    const container = document.getElementById('tool-content');

    let html = `
        <div class="space-y-3">
            <div class="flex items-center justify-between text-xs text-[var(--color-text-secondary)] font-semibold px-1">
                <span>Arraste ou use os botões para reordenar, girar ou excluir páginas</span>
                <span>${organizePages.filter(p => !p.delete).length} de ${organizePages.length} páginas ativas</span>
            </div>

            <div id="organize-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-3 border border-[var(--color-border-primary)] rounded-xl bg-[var(--color-bg-primary)] max-h-[58vh] overflow-y-auto">
    `;

    organizePages.forEach((p, idx) => {
        if (p.delete) return;
        html += `
            <div draggable="true" ondragstart="handlePageDragStart(event, ${idx})" ondragover="handlePageDragOver(event)" ondrop="handlePageDrop(event, ${idx})"
                class="page-card relative p-2.5 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] hover:border-blue-400 transition-all flex flex-col items-center gap-2 group shadow-2xs select-none">
                
                <!-- Quick Page Actions Overlay / Header -->
                <div class="w-full flex items-center justify-between text-[11px] font-bold px-1">
                    <span class="w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                        ${idx + 1}
                    </span>
                    <span class="text-[10px] text-[var(--color-text-secondary)]">Orig: pág ${p.page_num}</span>
                    <button type="button" onclick="deleteOrganizePage(${idx})" class="text-slate-400 hover:text-rose-500 transition-colors" title="Excluir página">
                        ✕
                    </button>
                </div>

                <!-- Page Thumbnail with Live Rotation -->
                <div class="relative w-full aspect-[1/1.4] bg-white rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-xs">
                    ${p.thumbnail ? `<img src="${p.thumbnail}" style="transform: rotate(${p.rotation}deg); transition: transform 0.2s ease;" class="max-w-full max-h-full object-contain pointer-events-none" />` : `<span class="text-xs text-slate-400">Pág ${p.page_num}</span>`}
                    
                    ${p.rotation !== 0 ? `<div class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900/80 text-white">${p.rotation}°</div>` : ''}
                </div>

                <!-- Footer rotation and order controls -->
                <div class="w-full flex items-center justify-between gap-1 pt-1 border-t border-[var(--color-border-primary)]">
                    <button type="button" onclick="rotateOrganizePage(${idx}, -90)" class="p-1 rounded bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-hover)] text-xs" title="Girar 90° Anti-horário">↺</button>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="moveOrganizePage(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} class="px-1.5 py-0.5 rounded bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-30 text-[11px]">◀</button>
                        <button type="button" onclick="moveOrganizePage(${idx}, 1)" ${idx === organizePages.length - 1 ? 'disabled' : ''} class="px-1.5 py-0.5 rounded bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-30 text-[11px]">▶</button>
                    </div>
                    <button type="button" onclick="rotateOrganizePage(${idx}, 90)" class="p-1 rounded bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-hover)] text-xs" title="Girar 90° Horário">↻</button>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
    updateProcessInfo();
}

function rotateOrganizePage(index, deg) {
    if (organizePages[index]) {
        organizePages[index].rotation = (organizePages[index].rotation + deg + 360) % 360;
        renderOrganizeGrid();
    }
}

function rotateAllPages(deg) {
    organizePages.forEach(p => {
        p.rotation = (p.rotation + deg + 360) % 360;
    });
    renderOrganizeGrid();
}

function deleteOrganizePage(index) {
    if (organizePages[index]) {
        organizePages[index].delete = true;
        renderOrganizeGrid();
    }
}

function moveOrganizePage(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= organizePages.length) return;
    const temp = organizePages[index];
    organizePages[index] = organizePages[target];
    organizePages[target] = temp;
    renderOrganizeGrid();
}

function resetPageOrder() {
    organizePages = currentDocument.pages.map(p => ({
        source_index: p.page_index,
        page_num: p.page_num,
        thumbnail: p.thumbnail,
        rotation: 0,
        delete: false
    }));
    renderOrganizeGrid();
}

// Drag & Drop reordering
function handlePageDragStart(e, idx) {
    draggedPageIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
}

function handlePageDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handlePageDrop(e, targetIdx) {
    e.preventDefault();
    if (draggedPageIdx === null || draggedPageIdx === targetIdx) return;
    const item = organizePages.splice(draggedPageIdx, 1)[0];
    organizePages.splice(targetIdx, 0, item);
    draggedPageIdx = null;
    renderOrganizeGrid();
}

// ----------------------------------------------------------------------------------
// 4. COMPRESS VIEW
// ----------------------------------------------------------------------------------
let compressionLevel = 'medium';

function renderCompressView() {
    const container = document.getElementById('tool-content');

    let html = `
        <div class="max-w-2xl mx-auto space-y-6">
            <!-- File Info Card -->
            <div class="p-4 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <span class="text-3xl">📄</span>
                    <div>
                        <div class="font-bold text-sm text-[var(--color-text-primary)]">${currentDocument.name}</div>
                        <div class="text-xs text-[var(--color-text-secondary)]">${currentDocument.pageCount} páginas • Tamanho original: <strong class="text-blue-600">${formatBytes(currentDocument.size)}</strong></div>
                    </div>
                </div>
            </div>

            <!-- Compression Presets -->
            <div class="space-y-3">
                <label class="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Escolha o nível de compressão desejado:
                </label>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div onclick="setCompressLevel('medium')" id="comp-opt-medium"
                        class="cursor-pointer p-4 rounded-xl border-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 transition-all flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <span class="font-bold text-xs md:text-sm text-blue-600 dark:text-blue-400">Recomendada</span>
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-600 text-white">Equilíbrio</span>
                            </div>
                            <p class="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                                Excelente redução mantendo nitidez visual de alta qualidade para relatórios e plantas.
                            </p>
                        </div>
                    </div>

                    <div onclick="setCompressLevel('high')" id="comp-opt-high"
                        class="cursor-pointer p-4 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:border-blue-400 transition-all flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <span class="font-bold text-xs md:text-sm text-[var(--color-text-primary)]">Extrema</span>
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">Menor tamanho</span>
                            </div>
                            <p class="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                                Máxima compressão de imagens. Ideal para envio por e-mail e armazenamento leve.
                            </p>
                        </div>
                    </div>

                    <div onclick="setCompressLevel('low')" id="comp-opt-low"
                        class="cursor-pointer p-4 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:border-blue-400 transition-all flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <span class="font-bold text-xs md:text-sm text-[var(--color-text-primary)]">Leve</span>
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">Alta fidelidade</span>
                            </div>
                            <p class="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                                Redução de tamanho sem qualquer perda visual perceptível nos textos e vetores.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    updateProcessInfo();
}

function setCompressLevel(lvl) {
    compressionLevel = lvl;
    ['medium', 'high', 'low'].forEach(l => {
        const card = document.getElementById(`comp-opt-${l}`);
        if (!card) return;
        if (l === lvl) {
            card.className = 'cursor-pointer p-4 rounded-xl border-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 transition-all flex flex-col justify-between';
            card.querySelector('.font-bold').className = 'font-bold text-xs md:text-sm text-blue-600 dark:text-blue-400';
        } else {
            card.className = 'cursor-pointer p-4 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:border-blue-400 transition-all flex flex-col justify-between';
            card.querySelector('.font-bold').className = 'font-bold text-xs md:text-sm text-[var(--color-text-primary)]';
        }
    });
}

// ----------------------------------------------------------------------------------
// 5. UNLOCK VIEW (Remover Senha)
// ----------------------------------------------------------------------------------
function renderUnlockView() {
    const container = document.getElementById('tool-content');

    let html = `
        <div class="max-w-md mx-auto space-y-6">
            <div class="p-6 rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-center space-y-4">
                <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-3xl">
                    🔓
                </div>
                <div>
                    <h3 class="text-base font-bold text-[var(--color-text-primary)]">${currentDocument.name}</h3>
                    <p class="text-xs text-[var(--color-text-secondary)] mt-1">
                        ${currentDocument.isEncrypted ? 'Este documento requer a senha atual para remover a proteção.' : 'Este documento não possui criptografia ativa, mas você pode salvá-lo desprotegido.'}
                    </p>
                </div>

                <div class="space-y-2 text-left pt-2">
                    <label class="block text-xs font-semibold text-[var(--color-text-secondary)]">
                        Digite a senha do arquivo PDF:
                    </label>
                    <div class="relative">
                        <input type="password" id="unlock-password" placeholder="Senha do documento..."
                            class="w-full px-3.5 py-2.5 rounded-xl text-sm border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)] focus:ring-2 focus:ring-blue-500">
                    </div>
                    <span class="text-[11px] text-[var(--color-text-secondary)]">
                        A senha será removida definitivamente da nova cópia gerada.
                    </span>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    updateProcessInfo();
}

// ----------------------------------------------------------------------------------
// 6. PROTECT VIEW (Adicionar Senha)
// ----------------------------------------------------------------------------------
function renderProtectView() {
    const container = document.getElementById('tool-content');

    let html = `
        <div class="max-w-lg mx-auto space-y-6">
            <div class="p-6 rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] space-y-4">
                <div class="flex items-center gap-3 pb-3 border-b border-[var(--color-border-primary)]">
                    <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl">
                        🔒
                    </div>
                    <div>
                        <h4 class="text-sm font-bold text-[var(--color-text-primary)]">${currentDocument.name}</h4>
                        <span class="text-xs text-[var(--color-text-secondary)]">Criptografia padrão militar AES-256 bits</span>
                    </div>
                </div>

                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                            Senha de Abertura (necessária para abrir e visualizar): *
                        </label>
                        <input type="password" id="protect-password" placeholder="Defina a senha de abertura..."
                            class="w-full px-3.5 py-2.5 rounded-xl text-sm border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)] focus:ring-2 focus:ring-blue-500">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                            Confirmar Senha: *
                        </label>
                        <input type="password" id="protect-password-confirm" placeholder="Confirme a senha..."
                            class="w-full px-3.5 py-2.5 rounded-xl text-sm border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)] focus:ring-2 focus:ring-blue-500">
                    </div>

                    <div class="pt-2 space-y-2">
                        <span class="block text-xs font-semibold text-[var(--color-text-secondary)]">Permissões do Documento:</span>
                        <div class="flex flex-col gap-1.5 text-xs text-[var(--color-text-primary)]">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" id="perm-print" checked class="rounded text-blue-600 focus:ring-blue-500">
                                <span>Permitir impressão em alta resolução</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" id="perm-copy" checked class="rounded text-blue-600 focus:ring-blue-500">
                                <span>Permitir cópia de texto e conteúdo</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    updateProcessInfo();
}

// ----------------------------------------------------------------------------------
// 7. SIGN & STAMP VIEW
// ----------------------------------------------------------------------------------
function renderSignView() {
    const container = document.getElementById('tool-content');

    let html = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <!-- Left Controls Column (Signature Creator) -->
            <div class="lg:col-span-5 space-y-4">
                <div class="p-4 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] space-y-4">
                    <div class="flex items-center justify-between">
                        <h4 class="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Criar Assinatura / Carimbo</h4>
                        <div class="flex items-center gap-1 bg-[var(--color-bg-secondary)] p-0.5 rounded-lg text-xs">
                            <button type="button" onclick="setSignMode('draw')" id="sign-tab-draw" class="px-2.5 py-1 rounded-md font-bold bg-blue-600 text-white shadow-2xs">Desenhar</button>
                            <button type="button" onclick="setSignMode('type')" id="sign-tab-type" class="px-2.5 py-1 rounded-md font-medium text-[var(--color-text-secondary)]">Digitar</button>
                            <button type="button" onclick="setSignMode('upload')" id="sign-tab-upload" class="px-2.5 py-1 rounded-md font-medium text-[var(--color-text-secondary)]">Carimbo/Img</button>
                        </div>
                    </div>

                    <!-- Panel 1: DRAW -->
                    <div id="sign-panel-draw" class="space-y-3">
                        <div class="relative border-2 border-dashed border-[var(--color-border-primary)] rounded-xl bg-white overflow-hidden">
                            <canvas id="sign-canvas" width="400" height="160" class="w-full h-40 cursor-crosshair touch-none"></canvas>
                            <button type="button" onclick="clearSignCanvas()" class="absolute bottom-2 right-2 px-2 py-1 rounded-md text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 shadow-2xs">
                                Limpar
                            </button>
                        </div>
                        <div class="flex items-center justify-between text-xs">
                            <div class="flex items-center gap-1.5">
                                <span class="text-[11px] text-[var(--color-text-secondary)]">Cor:</span>
                                <button type="button" onclick="setPenColor('#000000')" class="w-5 h-5 rounded-full bg-black ring-2 ring-offset-1 ring-blue-500"></button>
                                <button type="button" onclick="setPenColor('#1d4ed8')" class="w-5 h-5 rounded-full bg-blue-700"></button>
                                <button type="button" onclick="setPenColor('#047857')" class="w-5 h-5 rounded-full bg-emerald-700"></button>
                            </div>
                            <span class="text-[11px] text-[var(--color-text-secondary)]">Desenhe com o mouse ou caneta</span>
                        </div>
                    </div>

                    <!-- Panel 2: TYPE -->
                    <div id="sign-panel-type" class="hidden space-y-3">
                        <input type="text" id="sign-type-input" oninput="onSignTypeInput(this.value)" placeholder="Digite seu nome completo..."
                            class="w-full px-3 py-2 rounded-xl text-sm border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)]">
                        <div class="p-4 border rounded-xl bg-white text-slate-900 text-center text-3xl font-signature-1 min-h-[90px] flex items-center justify-center select-none" id="sign-type-preview">
                            Sua Assinatura
                        </div>
                    </div>

                    <!-- Panel 3: UPLOAD -->
                    <div id="sign-panel-upload" class="hidden space-y-3">
                        <input type="file" id="sign-upload-input" accept="image/png,image/jpeg,image/webp" onchange="onSignImageUpload(event)" class="hidden">
                        <button type="button" onclick="document.getElementById('sign-upload-input').click()"
                            class="w-full py-4 border-2 border-dashed border-[var(--color-border-primary)] rounded-xl text-center text-xs text-[var(--color-text-secondary)] hover:border-blue-500 flex flex-col items-center gap-1">
                            <span class="text-xl">📁</span>
                            <span class="font-bold">Carregar imagem de assinatura ou carimbo</span>
                            <span class="text-[10px]">PNG transparente recomendado</span>
                        </button>
                        <div id="sign-upload-preview-box" class="hidden p-2 border rounded-xl bg-white flex items-center justify-center h-28">
                            <img id="sign-upload-img" src="" class="max-h-full max-w-full object-contain" />
                        </div>
                    </div>

                    <!-- Page selection to place signature -->
                    <div class="pt-3 border-t border-[var(--color-border-primary)] space-y-2">
                        <div class="flex items-center justify-between text-xs">
                            <span class="font-semibold text-[var(--color-text-secondary)]">Aplicar na Página:</span>
                            <select id="sign-page-select" onchange="changeSignPage(parseInt(this.value))"
                                class="px-2.5 py-1 rounded-lg text-xs border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)]">
                                ${currentDocument.pages.map(p => `<option value="${p.page_index}">Página ${p.page_num}</option>`).join('')}
                            </select>
                        </div>
                        <p class="text-[11px] text-[var(--color-text-secondary)]">
                            Clique ou arraste no documento à direita para posicionar sua assinatura.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Right Interactive Placement Preview -->
            <div class="lg:col-span-7 flex flex-col items-center">
                <div class="text-xs font-semibold text-[var(--color-text-secondary)] mb-2 self-start flex items-center gap-2">
                    <span>Posicione a assinatura no local exato:</span>
                    <span class="text-[11px] font-normal text-blue-500">(Clique sobre a folha para posicionar)</span>
                </div>

                <div id="sign-preview-wrapper" onclick="handleSignaturePlacementClick(event)"
                    class="relative max-w-md w-full aspect-[1/1.414] bg-white rounded-xl shadow-lg border border-slate-300 dark:border-slate-700 overflow-hidden select-none cursor-crosshair">
                    <!-- Page Image Background -->
                    <img id="sign-preview-page-img" src="${currentDocument.pages[0]?.thumbnail || ''}" class="w-full h-full object-contain pointer-events-none" />

                    <!-- Movable / Draggable Signature Box -->
                    <div id="sign-box" style="left: 60%; top: 80%; width: 32%; height: 12%;"
                        class="absolute border-2 border-dashed border-blue-600 bg-blue-500/15 rounded-md flex items-center justify-center p-1 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 shadow-xs transition-all">
                        <img id="sign-box-img" src="" class="max-h-full max-w-full object-contain" />
                        <span id="sign-box-placeholder" class="text-[10px] font-bold text-blue-700">Assinatura aqui</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    initSignCanvas();
    updateProcessInfo();
}

function initSignCanvas() {
    const canvas = document.getElementById('sign-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    signatureData.canvas = canvas;
    signatureData.ctx = ctx;

    ctx.strokeStyle = signatureData.penColor;
    ctx.lineWidth = signatureData.penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function getCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function startDrawing(e) {
        signatureData.isDrawing = true;
        const pos = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    }

    function draw(e) {
        if (!signatureData.isDrawing) return;
        e.preventDefault();
        const pos = getCoords(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }

    function stopDrawing() {
        if (signatureData.isDrawing) {
            signatureData.isDrawing = false;
            updateLiveSignatureOverlay();
        }
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);

    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    window.addEventListener('touchend', stopDrawing);
}

function clearSignCanvas() {
    if (!signatureData.ctx) return;
    signatureData.ctx.clearRect(0, 0, signatureData.canvas.width, signatureData.canvas.height);
    updateLiveSignatureOverlay();
}

function setPenColor(color) {
    signatureData.penColor = color;
    if (signatureData.ctx) signatureData.ctx.strokeStyle = color;
}

function setSignMode(mode) {
    signatureData.mode = mode;
    ['draw', 'type', 'upload'].forEach(m => {
        const tab = document.getElementById(`sign-tab-${m}`);
        const pnl = document.getElementById(`sign-panel-${m}`);
        if (m === mode) {
            tab.className = 'px-2.5 py-1 rounded-md font-bold bg-blue-600 text-white shadow-2xs';
            pnl.classList.remove('hidden');
        } else {
            tab.className = 'px-2.5 py-1 rounded-md font-medium text-[var(--color-text-secondary)]';
            pnl.classList.add('hidden');
        }
    });
    updateLiveSignatureOverlay();
}

function onSignTypeInput(val) {
    signatureData.typedText = val;
    const prev = document.getElementById('sign-type-preview');
    if (prev) prev.innerText = val || 'Sua Assinatura';
    updateLiveSignatureOverlay();
}

function onSignImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        signatureData.uploadedImageBase64 = reader.result;
        const previewBox = document.getElementById('sign-upload-preview-box');
        const img = document.getElementById('sign-upload-img');
        img.src = reader.result;
        previewBox.classList.remove('hidden');
        updateLiveSignatureOverlay();
    };
    reader.readAsDataURL(file);
}

function changeSignPage(pageIdx) {
    signatureData.targetPageIndex = pageIdx;
    const pg = currentDocument.pages[pageIdx];
    const previewImg = document.getElementById('sign-preview-page-img');
    if (previewImg && pg) {
        previewImg.src = pg.thumbnail;
    }
}

function handleSignaturePlacementClick(e) {
    const wrapper = document.getElementById('sign-preview-wrapper');
    const rect = wrapper.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    signatureData.placedX = Math.max(10, Math.min(90, xPct));
    signatureData.placedY = Math.max(10, Math.min(90, yPct));

    const box = document.getElementById('sign-box');
    if (box) {
        box.style.left = `${signatureData.placedX}%`;
        box.style.top = `${signatureData.placedY}%`;
    }
}

function getSignatureImageBase64() {
    if (signatureData.mode === 'draw') {
        if (!signatureData.canvas) return null;
        return signatureData.canvas.toDataURL('image/png');
    } else if (signatureData.mode === 'type') {
        const offscreen = document.createElement('canvas');
        offscreen.width = 500;
        offscreen.height = 150;
        const octx = offscreen.getContext('2d');
        octx.font = '60px "Caveat", cursive';
        octx.fillStyle = signatureData.penColor || '#000000';
        octx.textAlign = 'center';
        octx.textBaseline = 'middle';
        octx.fillText(signatureData.typedText || 'Assinatura', 250, 75);
        return offscreen.toDataURL('image/png');
    } else {
        return signatureData.uploadedImageBase64;
    }
}

function updateLiveSignatureOverlay() {
    const dataUrl = getSignatureImageBase64();
    const boxImg = document.getElementById('sign-box-img');
    const boxPlaceholder = document.getElementById('sign-box-placeholder');
    if (dataUrl) {
        boxImg.src = dataUrl;
        boxImg.classList.remove('hidden');
        if (boxPlaceholder) boxPlaceholder.classList.add('hidden');
    } else {
        boxImg.classList.add('hidden');
        if (boxPlaceholder) boxPlaceholder.classList.remove('hidden');
    }
}

// ----------------------------------------------------------------------------------
// 8. PDF TO IMAGES VIEW
// ----------------------------------------------------------------------------------
function renderPdfToImgView() {
    const container = document.getElementById('tool-content');

    let html = `
        <div class="max-w-xl mx-auto space-y-6">
            <div class="p-6 rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] space-y-4">
                <div class="flex items-center gap-3">
                    <span class="text-3xl">🖼️</span>
                    <div>
                        <h4 class="text-sm font-bold text-[var(--color-text-primary)]">${currentDocument.name}</h4>
                        <span class="text-xs text-[var(--color-text-secondary)]">${currentDocument.pageCount} páginas para conversão</span>
                    </div>
                </div>

                <div class="space-y-4 pt-2">
                    <div>
                        <label class="block text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Formato das Imagens:</label>
                        <div class="grid grid-cols-2 gap-3">
                            <label class="flex items-center gap-2 p-3 rounded-xl border border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 cursor-pointer">
                                <input type="radio" name="pdf-to-img-fmt" value="png" checked class="text-blue-600">
                                <div>
                                    <div class="text-xs font-bold text-[var(--color-text-primary)]">PNG (Recomendado)</div>
                                    <div class="text-[10px] text-[var(--color-text-secondary)]">Sem compressão com perda</div>
                                </div>
                            </label>
                            <label class="flex items-center gap-2 p-3 rounded-xl border border-[var(--color-border-primary)] hover:border-blue-400 cursor-pointer">
                                <input type="radio" name="pdf-to-img-fmt" value="jpeg" class="text-blue-600">
                                <div>
                                    <div class="text-xs font-bold text-[var(--color-text-primary)]">JPG</div>
                                    <div class="text-[10px] text-[var(--color-text-secondary)]">Arquivo mais leve</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Resolução / Qualidade (DPI):</label>
                        <select id="pdf-to-img-dpi" class="w-full px-3 py-2 rounded-xl text-xs border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)]">
                            <option value="150" selected>150 DPI (Padrão - Alta nitidez em tela)</option>
                            <option value="300">300 DPI (Qualidade Gráfica de Impressão)</option>
                            <option value="96">96 DPI (Web / Arquivo compactado)</option>
                        </select>
                    </div>

                    <p class="text-[11px] text-[var(--color-text-secondary)]">
                        * Se o documento possuir mais de 1 página, o download será gerado automaticamente em um arquivo ZIP com todas as imagens numeradas.
                    </p>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    updateProcessInfo();
}

// ----------------------------------------------------------------------------------
// 9. IMAGES TO PDF VIEW
// ----------------------------------------------------------------------------------
function renderImagesToPdfView() {
    const container = document.getElementById('tool-content');
    document.getElementById('btn-add-more').classList.remove('hidden');

    if (uploadedFiles.length === 0) {
        resetWorkspace();
        return;
    }

    let html = `
        <div class="space-y-4">
            <!-- Settings Bar -->
            <div class="p-3.5 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3 text-xs">
                    <span class="font-semibold text-[var(--color-text-secondary)]">Orientação:</span>
                    <select id="img2pdf-orient" class="px-2.5 py-1 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-input-bg)] text-[var(--color-input-text)]">
                        <option value="auto">Automática (adequa por imagem)</option>
                        <option value="portrait">Retrato (Vertical)</option>
                        <option value="landscape">Paisagem (Horizontal)</option>
                    </select>
                </div>
                <div class="text-xs text-[var(--color-text-secondary)]">
                    ${uploadedFiles.length} imagem(ns) adicionada(s)
                </div>
            </div>

            <!-- Image Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[55vh] overflow-y-auto p-2 border border-[var(--color-border-primary)] rounded-xl bg-[var(--color-bg-primary)]">
    `;

    uploadedFiles.forEach((item, index) => {
        html += `
            <div class="p-2 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] flex flex-col items-center gap-2 group shadow-2xs">
                <div class="w-full flex items-center justify-between text-[11px] font-bold">
                    <span class="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">${index + 1}</span>
                    <button type="button" onclick="removeMergeFile(${index})" class="text-slate-400 hover:text-rose-500">✕</button>
                </div>
                <div class="w-full aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center">
                    <img src="${item.dataUrl}" class="max-h-full max-w-full object-contain" />
                </div>
                <div class="w-full flex items-center justify-between text-xs pt-1">
                    <button type="button" onclick="moveMergeFile(${index}, -1)" ${index === 0 ? 'disabled' : ''} class="px-2 py-0.5 rounded bg-[var(--color-bg-primary)] disabled:opacity-30">◀</button>
                    <span class="text-[10px] text-[var(--color-text-secondary)] truncate max-w-[80px]">${item.name}</span>
                    <button type="button" onclick="moveMergeFile(${index}, 1)" ${index === uploadedFiles.length - 1 ? 'disabled' : ''} class="px-2 py-0.5 rounded bg-[var(--color-bg-primary)] disabled:opacity-30">▶</button>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
    updateProcessInfo();
}

// ----------------------------------------------------------------------------------
// PROCESS & EXECUTE TOOL
// ----------------------------------------------------------------------------------
async function executeCurrentTool() {
    if (!window.eel) {
        alert('O servidor local Python (Eel) não está conectado.');
        return;
    }

    showLoading('Processando seu PDF...', 'Executando operações criptográficas e estruturais...');

    try {
        let res = null;

        if (currentTool === 'merge') {
            if (uploadedFiles.length < 1) throw new Error('Adicione pelo menos 1 arquivo PDF.');
            const filesPayload = uploadedFiles.map(f => ({
                file_data: f.dataUrl,
                page_ranges: f.ranges || 'all'
            }));
            res = await eel.pdf_merge_docs(filesPayload, 'documento_mesclado.pdf')();

        } else if (currentTool === 'split') {
            if (!currentDocument) throw new Error('Nenhum documento carregado.');
            let rangesVal = '1';
            let fixedN = 1;
            if (splitMode === 'extract') {
                const rangeInput = document.getElementById('split-range-input');
                rangesVal = rangeInput ? rangeInput.value : formatSelectedPagesToRange();
            } else if (splitMode === 'by_interval') {
                const intervalInput = document.getElementById('split-interval-input');
                fixedN = intervalInput ? parseInt(intervalInput.value) || 1 : 1;
            }
            res = await eel.pdf_split_doc(currentDocument.dataUrl, splitMode, rangesVal, fixedN)();

        } else if (currentTool === 'organize') {
            if (!currentDocument) throw new Error('Nenhum documento carregado.');
            const ops = organizePages.map(p => ({
                source_index: p.source_index,
                rotation: p.rotation,
                delete: p.delete
            }));
            res = await eel.pdf_organize_doc(currentDocument.dataUrl, ops)();

        } else if (currentTool === 'compress') {
            if (!currentDocument) throw new Error('Nenhum documento carregado.');
            res = await eel.pdf_compress_doc(currentDocument.dataUrl, compressionLevel)();

        } else if (currentTool === 'unlock') {
            if (!currentDocument) throw new Error('Nenhum documento carregado.');
            const pwd = document.getElementById('unlock-password')?.value || '';
            res = await eel.pdf_unlock_doc(currentDocument.dataUrl, pwd)();

        } else if (currentTool === 'protect') {
            if (!currentDocument) throw new Error('Nenhum documento carregado.');
            const pwd = document.getElementById('protect-password')?.value || '';
            const pwdConfirm = document.getElementById('protect-password-confirm')?.value || '';
            if (!pwd) throw new Error('Por favor, informe a senha de proteção.');
            if (pwd !== pwdConfirm) throw new Error('As senhas digitadas não coincidem.');
            const canPrint = document.getElementById('perm-print')?.checked ?? true;
            const canCopy = document.getElementById('perm-copy')?.checked ?? true;
            res = await eel.pdf_protect_doc(currentDocument.dataUrl, pwd, pwd, canPrint, canCopy)();

        } else if (currentTool === 'sign') {
            if (!currentDocument) throw new Error('Nenhum documento carregado.');
            const imgData = getSignatureImageBase64();
            if (!imgData) throw new Error('Por favor, crie ou desenhe uma assinatura antes de aplicar.');

            const signaturesPayload = [{
                page_index: signatureData.targetPageIndex,
                image_data: imgData,
                x: signatureData.placedX - 16, // center anchor
                y: signatureData.placedY - 6,
                width: signatureData.placedW || 32,
                height: signatureData.placedH || 12,
                is_percentage: true,
                opacity: 1.0
            }];
            res = await eel.pdf_sign_stamp_doc(currentDocument.dataUrl, signaturesPayload)();

        } else if (currentTool === 'pdf_to_img') {
            if (!currentDocument) throw new Error('Nenhum documento carregado.');
            const fmt = document.querySelector('input[name="pdf-to-img-fmt"]:checked')?.value || 'png';
            const dpi = parseInt(document.getElementById('pdf-to-img-dpi')?.value || '150');
            res = await eel.pdf_convert_to_images(currentDocument.dataUrl, fmt, dpi)();

        } else if (currentTool === 'img_to_pdf') {
            if (uploadedFiles.length < 1) throw new Error('Adicione ao menos uma imagem.');
            const imagesPayload = uploadedFiles.map(item => item.dataUrl);
            const orient = document.getElementById('img2pdf-orient')?.value || 'auto';
            res = await eel.pdf_convert_images_to_pdf(imagesPayload, orient)();
        }

        if (res && res.status === 'success') {
            showResult(res);
        } else {
            throw new Error(res?.message || 'Falha ao processar arquivo.');
        }

    } catch (err) {
        console.error(err);
        alert(`Erro: ${err.message || err}`);
    } finally {
        hideLoading();
    }
}

// ----------------------------------------------------------------------------------
// SHOW RESULT
// ----------------------------------------------------------------------------------
function showResult(data) {
    const resultBox = document.getElementById('result-box');
    const btnDownload = document.getElementById('btn-download');
    const resultTitle = document.getElementById('result-title');
    const resultDesc = document.getElementById('result-desc');

    resultBox.classList.remove('hidden');
    resultBox.scrollIntoView({ behavior: 'smooth' });

    btnDownload.href = data.data_url;
    btnDownload.download = data.file_name || 'resultado.pdf';

    resultTitle.innerText = data.message || 'Arquivo processado com sucesso!';
    
    let info = `Tamanho final: ${formatBytes(data.file_size)}`;
    if (data.saved_percentage !== undefined) {
        info += ` • Redução de ${data.saved_percentage}% de espaço!`;
    }
    if (data.page_count !== undefined) {
        info += ` • ${data.page_count} página(s)`;
    }
    resultDesc.innerText = info;
}

// UI Helpers
function updateProcessInfo() {
    const info = document.getElementById('process-info');
    if (currentTool === 'merge' || currentTool === 'img_to_pdf') {
        info.innerText = `${uploadedFiles.length} item(ns) na fila`;
    } else if (currentDocument) {
        info.innerText = `${currentDocument.name} (${formatBytes(currentDocument.size)}) • ${currentDocument.pageCount} pág(s)`;
    } else {
        info.innerText = '';
    }
}

function showLoading(title, desc) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    document.getElementById('loading-title').innerText = title || 'Processando...';
    document.getElementById('loading-desc').innerText = desc || 'Aguarde...';
    overlay.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
}
