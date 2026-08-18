/**
 * FinControl - Rendición de Cuentas Module
 * Handles OCR processing of invoices, bank statement parsing, matching algorithm,
 * and manual adjustment workflows.
 */

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Module State
const ReconState = {
    pdfFile: null,
    zipFile: null,
    supportFiles: [], // holds array of files (ZIPs, PDFs, images)
    transactions: [], // { id, dateStr, date, description, amount, matched, invoice }
    invoices: [],     // { name, imageSrc, text, extractedAmount, extractedDateStr, extractedDate, matched }
    singleInvoiceTargetTx: null, // holds transaction target when manually uploading single invoice
    activeInvoiceToLink: null, // holds active orphan invoice being manually linked
    activeTxToUnlink: null, // holds active transaction being unlinked
    uploadIsReimbursement: false
};

// DOM Elements
const reconElements = {
    inputPdf: document.getElementById('input-pdf'),
    inputZip: document.getElementById('input-zip'),
    pdfFileInfo: document.getElementById('pdf-file-info'),
    zipFileInfo: document.getElementById('zip-file-info'),
    btnProcess: document.getElementById('btn-process-reconciliation'),
    
    // Progress Panel
    panelProgress: document.getElementById('panel-progress'),
    progressFill: document.getElementById('ocr-progress-fill'),
    progressStatus: document.getElementById('ocr-progress-status'),
    progressPercent: document.getElementById('ocr-progress-percent'),
    logsContainer: document.getElementById('ocr-logs'),
    
    // Stats
    statsSection: document.getElementById('reconciliation-stats'),
    statTotalTx: document.getElementById('stat-total-tx'),
    statMatchedTx: document.getElementById('stat-matched-tx'),
    statMissingTx: document.getElementById('stat-missing-tx'),
    statOrphanInvoices: document.getElementById('stat-orphan-invoices'),
    successBanner: document.getElementById('reconciliation-success-banner'),
    
    // Results
    resultsSection: document.getElementById('reconciliation-results'),
    tabUnresolved: document.getElementById('tab-unresolved'),
    tabResolved: document.getElementById('tab-resolved'),
    tabOrphans: document.getElementById('tab-orphans'),
    tabAllTx: document.getElementById('tab-all-tx'),
    
    // Counters
    countUnresolved: document.getElementById('count-unresolved'),
    countResolved: document.getElementById('count-resolved'),
    countOrphans: document.getElementById('count-orphans'),
    countAllTx: document.getElementById('count-all-tx'),
    statRetentionsAudit: document.getElementById('stat-retentions-audit'),
    taxAlertBanner: document.getElementById('reconciliation-tax-alert-banner'),
    taxAlertText: document.getElementById('reconciliation-tax-alert-text'),
    
    // Modals
    modalTx: document.getElementById('modal-transaction'),
    formTx: document.getElementById('form-transaction'),
    modalTitle: document.getElementById('modal-title'),
    inputTxId: document.getElementById('input-tx-id'),
    inputTxDate: document.getElementById('input-tx-date'),
    inputTxReference: document.getElementById('input-tx-reference'),
    inputTxDesc: document.getElementById('input-tx-desc'),
    inputTxCurrency: document.getElementById('input-tx-currency'),
    inputTxAmount: document.getElementById('input-tx-amount'),
    btnAddTx: document.getElementById('btn-add-transaction'),
    
    modalUpload: document.getElementById('modal-upload-invoice'),
    inputSingleInvoice: document.getElementById('input-single-invoice'),
    singleInvoiceFileInfo: document.getElementById('single-invoice-file-info'),
    btnProcessSingleInvoice: document.getElementById('btn-process-single-invoice'),
    singleInvoiceProgress: document.getElementById('single-invoice-progress'),
    singleInvoiceProgressFill: document.getElementById('single-invoice-progress-fill'),
    singleInvoiceProgressStatus: document.getElementById('single-invoice-progress-status'),
    singleInvoiceProgressPercent: document.getElementById('single-invoice-progress-percent'),
    targetTxDate: document.getElementById('target-tx-date'),
    targetTxDesc: document.getElementById('target-tx-desc'),
    targetTxAmount: document.getElementById('target-tx-amount'),
    
    modalView: document.getElementById('modal-view-invoice'),
    viewInvoiceImg: document.getElementById('view-invoice-img'),
    viewInvoiceName: document.getElementById('view-invoice-name'),
    viewInvoiceDate: document.getElementById('input-view-invoice-date'),
    viewInvoiceAmount: document.getElementById('view-invoice-amount'),
    viewInvoiceTxAmount: document.getElementById('view-invoice-tx-amount'),
    viewInvoiceRawText: document.getElementById('view-invoice-raw-text'),
    viewInvoiceLinkContainer: document.getElementById('view-invoice-link-container'),
    selectUnresolvedTxForLinking: document.getElementById('select-unresolved-tx-for-linking'),
    btnLinkInvoiceManually: document.getElementById('btn-link-invoice-manually'),
    
    // New features DOM elements
    btnClearRecon: document.getElementById('btn-clear-reconciliation'),
    btnSaveRecon: document.getElementById('btn-save-reconciliation'),
    btnDownloadPdf: document.getElementById('btn-download-pdf-report'),
    modalSaveRecon: document.getElementById('modal-save-recon'),
    formSaveRecon: document.getElementById('form-save-recon'),
    selectSaveMonth: document.getElementById('select-save-month'),
    inputSaveYear: document.getElementById('input-save-year'),
    inputSaveNumber: document.getElementById('input-save-number'),
    tbodyHistory: document.querySelector('#table-history tbody'),
    textareaNotes: document.getElementById('textarea-reconciliation-notes')
};

// --- DATABASE PERSISTENCE (INDEXEDDB) ---
const DB_NAME = 'FinControlDB';
const STORE_NAME = 'reconciliations';
const STORE_CARDS = 'card_inventory';
const DB_VERSION = 2;

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_CARDS)) {
                db.createObjectStore(STORE_CARDS, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function dbSaveReconciliation(record) {
    return getDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    });
}

function dbGetAllReconciliations() {
    return getDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    });
}

function dbDeleteReconciliation(id) {
    return getDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    });
}

function dbSaveInventoryCard(cardRecord) {
    return getDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_CARDS, 'readwrite');
            const store = tx.objectStore(STORE_CARDS);
            const request = store.put(cardRecord);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    });
}

function dbGetAllInventoryCards() {
    return getDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_CARDS, 'readonly');
            const store = tx.objectStore(STORE_CARDS);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    });
}

function dbDeleteInventoryCard(id) {
    return getDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_CARDS, 'readwrite');
            const store = tx.objectStore(STORE_CARDS);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    });
}

window.dbSaveInventoryCard = dbSaveInventoryCard;
window.dbGetAllInventoryCards = dbGetAllInventoryCards;
window.dbDeleteInventoryCard = dbDeleteInventoryCard;

async function migrateLocalStorageToIndexedDB() {
    try {
        const legacyData = localStorage.getItem('fincontrol_saved_recons');
        if (legacyData) {
            const records = JSON.parse(legacyData);
            if (Array.isArray(records) && records.length > 0) {
                console.log(`Migrating ${records.length} legacy records from localStorage to IndexedDB...`);
                for (const record of records) {
                    if (!record.id) {
                        record.id = 'recon-' + Date.now() + '-' + Math.random();
                    }
                    await dbSaveReconciliation(record);
                }
                localStorage.removeItem('fincontrol_saved_recons');
                console.log('Migration complete!');
            }
        }
    } catch (err) {
        console.error('Error during database migration:', err);
    }
}

// Initialize listeners on load
document.addEventListener('DOMContentLoaded', async () => {
    initFileListeners();
    initModalListeners();
    initTabControls();
    initNewReconciliationListeners();
    await migrateLocalStorageToIndexedDB();
    renderSavedReconciliationsList();
});

// --- FILE UPLOAD & LISTENERS ---

function initFileListeners() {
    // PDF input triggers
    const dropPdf = document.getElementById('drop-pdf');
    reconElements.inputPdf.addEventListener('change', (e) => {
        handlePdfSelection(e.target.files[0]);
    });
    
    dropPdf.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropPdf.classList.add('dragover');
    });
    
    dropPdf.addEventListener('dragleave', () => {
        dropPdf.classList.remove('dragover');
    });
    
    dropPdf.addEventListener('drop', (e) => {
        e.preventDefault();
        dropPdf.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handlePdfSelection(e.dataTransfer.files[0]);
        }
    });

    // ZIP/PDF support input triggers
    const dropZip = document.getElementById('drop-zip');
    reconElements.inputZip.addEventListener('change', (e) => {
        handleSupportFilesSelection(e.target.files);
    });
    
    dropZip.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZip.classList.add('dragover');
    });
    
    dropZip.addEventListener('dragleave', () => {
        dropZip.classList.remove('dragover');
    });
    
    dropZip.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZip.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleSupportFilesSelection(e.dataTransfer.files);
        }
    });

    // Process button trigger
    reconElements.btnProcess.addEventListener('click', () => {
        processFiles();
    });

    // Clear support files trigger
    const btnClearSupport = document.getElementById('btn-clear-support-files');
    if (btnClearSupport) {
        btnClearSupport.addEventListener('click', (e) => {
            e.stopPropagation(); // Avoid triggering dropzone click
            ReconState.supportFiles = [];
            ReconState.zipFile = null;
            if (reconElements.inputZip) reconElements.inputZip.value = '';
            if (reconElements.zipFileInfo) {
                reconElements.zipFileInfo.textContent = 'Ningún archivo seleccionado';
                reconElements.zipFileInfo.style.color = '';
            }
            btnClearSupport.classList.add('hidden');
            window.showToast('Archivos de soporte limpiados', 'info');
            checkProcessButton();
        });
    }
}

function handlePdfSelection(file) {
    if (!file || file.type !== 'application/pdf') {
        window.showToast('Por favor selecciona un archivo PDF válido', 'error');
        return;
    }
    ReconState.pdfFile = file;
    reconElements.pdfFileInfo.textContent = `${file.name} (${formatBytes(file.size)})`;
    reconElements.pdfFileInfo.style.color = 'var(--color-success)';
    window.showToast('Estado de cuenta PDF cargado', 'success');
    checkProcessButton();
}

function handleSupportFilesSelection(fileList) {
    if (!fileList || fileList.length === 0) return;
    
    const filesArray = Array.from(fileList);
    // Overwrite previous support files selection on new upload
    ReconState.supportFiles = filesArray;
    
    const totalCount = ReconState.supportFiles.length;
    if (totalCount === 1) {
        const file = ReconState.supportFiles[0];
        reconElements.zipFileInfo.textContent = `${file.name} (${formatBytes(file.size)})`;
        reconElements.zipFileInfo.style.color = 'var(--color-success)';
        ReconState.zipFile = file;
    } else {
        reconElements.zipFileInfo.textContent = `${totalCount} archivo(s) de soporte cargado(s)`;
        reconElements.zipFileInfo.style.color = 'var(--color-success)';
        ReconState.zipFile = ReconState.supportFiles[0];
    }
    
    // Show clear support button if present
    const btnClearSupport = document.getElementById('btn-clear-support-files');
    if (btnClearSupport) {
        btnClearSupport.classList.remove('hidden');
    }
    
    window.showToast(`${totalCount} archivo(s) de soporte cargado(s)`, 'success');
    checkProcessButton();

    // Re-hydration logic for historical loads (if a ZIP file is present)
    const zipFile = ReconState.supportFiles.find(f => f.name.endsWith('.zip') || f.type.includes('zip'));
    if (zipFile && ReconState.invoices.length > 0) {
        rehydrateImagesFromZip(zipFile);
    }
}

async function rehydrateImagesFromZip(file) {
    const emptyInvoices = ReconState.invoices.filter(inv => !inv.imageSrc);
    if (emptyInvoices.length > 0) {
        try {
            window.showToast('Rehidratando imágenes desde el ZIP cargado...', 'info');
            const zip = await JSZip.loadAsync(file);
            let hydratedCount = 0;
            
            for (const inv of emptyInvoices) {
                const entryName = inv.name;
                const entryNameClean = entryName.replace(/\s*\(Pág\.\s*\d+\)$/i, "");
                let zipEntry = zip.file(entryNameClean);
                
                if (!zipEntry) {
                    const baseName = entryNameClean.substring(entryNameClean.lastIndexOf('/') + 1);
                    zipEntry = Object.values(zip.files).find(f => !f.dir && f.name.substring(f.name.lastIndexOf('/') + 1) === baseName);
                }
                
                if (zipEntry) {
                    const blob = await zipEntry.async('blob');
                    let base64 = "";
                    const isPdf = entryNameClean.toLowerCase().endsWith('.pdf');
                    if (isPdf) {
                        const arrayBuffer = await zipEntry.async('arraybuffer');
                        try {
                            const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
                            const pdf = await loadingTask.promise;
                            const pageNum = inv.pageNum || 1;
                            base64 = await convertPdfPageToImage(pdf, pageNum);
                        } catch (e) {
                            console.error("Error converting PDF to image in rehydration:", e);
                            base64 = await blobToBase64(blob);
                        }
                    } else {
                        base64 = await blobToBase64(blob);
                    }
                    inv.imageSrc = base64;
                    inv.base64 = base64;
                    inv.blob = blob;
                    hydratedCount++;
                }
            }
            
            if (hydratedCount > 0) {
                window.showToast(`Se rehidrataron ${hydratedCount} imágenes de soportes fiscales.`, 'success');
                if (typeof renderSummaryCards === 'function') renderSummaryCards();
                if (typeof renderReconciliationTables === 'function') renderReconciliationTables();
            } else {
                window.showToast('No se encontraron imágenes coincidentes en el ZIP.', 'warning');
            }
        } catch (err) {
            console.error("Error rehydrating images from ZIP:", err);
            window.showToast('Error al rehidratar imágenes desde el ZIP.', 'error');
        }
    }
}

function checkProcessButton() {
    const hasSupport = (ReconState.supportFiles && ReconState.supportFiles.length > 0) || ReconState.zipFile;
    if (ReconState.pdfFile && hasSupport) {
        reconElements.btnProcess.removeAttribute('disabled');
    } else {
        reconElements.btnProcess.setAttribute('disabled', 'true');
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- FILE PROCESSING PIPELINE ---

async function processFiles() {
    try {
        // Reset UI State
        reconElements.panelProgress.classList.remove('hidden');
        reconElements.statsSection.classList.add('hidden');
        reconElements.resultsSection.classList.add('hidden');
        reconElements.successBanner.classList.add('hidden');
        reconElements.logsContainer.innerHTML = '';
        
        updateProgress(5, 'Leyendo estado de cuenta PDF...');
        addLog('Iniciando procesamiento...', 'info');
        
        // Revoke old object URLs to avoid memory leaks
        ReconState.invoices.forEach(inv => {
            if (inv.imageSrc && !inv.imageSrc.startsWith('data:')) {
                URL.revokeObjectURL(inv.imageSrc);
            }
        });
        ReconState.invoices = [];
        ReconState.transactions = [];

        // 1. READ PDF STATE & COLUMNS
        addLog('Leyendo archivo PDF y extrayendo transacciones con monedas...', 'info');
        const pdfData = await readFileAsArrayBuffer(ReconState.pdfFile);
        await parseTransactionsWithCoordinates(pdfData);
        addLog(`Se detectaron ${ReconState.transactions.length} transacciones en el PDF.`, 'success');

        if (ReconState.transactions.length === 0) {
            addLog('No se encontraron transacciones en el estado de cuenta. Habilita la adición manual.', 'warning');
        }

        // 2. BUILD PROCESSIBLE ENTRIES QUEUE
        updateProgress(25, 'Preparando archivos de soporte...');
        addLog('Construyendo cola de archivos a procesar...', 'info');

        const filesToProcess = [];
        let sources = [];
        if (ReconState.supportFiles && ReconState.supportFiles.length > 0) {
            sources = ReconState.supportFiles;
        } else if (ReconState.zipFile) {
            sources = [ReconState.zipFile];
        }

        if (sources.length === 0) {
            throw new Error('No se han seleccionado archivos de soporte (ZIP, PDF o imágenes).');
        }

        for (const file of sources) {
            const lowerName = file.name.toLowerCase();
            if (lowerName.endsWith('.zip')) {
                addLog(`Descomprimiendo archivo ZIP: ${file.name}...`, 'info');
                try {
                    const zip = await JSZip.loadAsync(file);
                    const zipEntries = [];
                    zip.forEach((relativePath, zipEntry) => {
                        const isHidden = zipEntry.name.startsWith('.') || 
                                         zipEntry.name.includes('/.') || 
                                         zipEntry.name.includes('__MACOSX') || 
                                         zipEntry.name.toLowerCase().includes('thumbs.db');
                        if (!zipEntry.dir && !isHidden && /\.(png|jpe?g|webp|pdf)$/i.test(zipEntry.name)) {
                            zipEntries.push(zipEntry);
                        }
                    });
                    
                    for (const entry of zipEntries) {
                        const isPdf = entry.name.toLowerCase().endsWith('.pdf');
                        const blob = await entry.async('blob');
                        const arrayBuffer = isPdf ? await entry.async('arraybuffer') : null;
                        filesToProcess.push({
                            name: entry.name,
                            blob: blob,
                            arrayBuffer: arrayBuffer,
                            isPdf: isPdf,
                            isFromZip: true
                        });
                    }
                    addLog(`Descomprimidos ${zipEntries.length} archivos de ${file.name}`, 'success');
                } catch (zipErr) {
                    addLog(`Error leyendo ZIP ${file.name}: ${zipErr.message}`, 'error');
                }
            } else if (lowerName.endsWith('.pdf')) {
                const arrayBuffer = await readFileAsArrayBuffer(file);
                filesToProcess.push({
                    name: file.name,
                    blob: file,
                    arrayBuffer: arrayBuffer,
                    isPdf: true,
                    isFromZip: false
                });
            } else if (/\.(png|jpe?g|webp)$/i.test(lowerName)) {
                filesToProcess.push({
                    name: file.name,
                    blob: file,
                    arrayBuffer: null,
                    isPdf: false,
                    isFromZip: false
                });
            } else {
                addLog(`Archivo ignorado (formato no soportado): ${file.name}`, 'warning');
            }
        }

        addLog(`Total de archivos/documentos listados para análisis: ${filesToProcess.length}`, 'info');
        if (filesToProcess.length === 0) {
            throw new Error('No se encontraron imágenes o PDFs válidos en los archivos seleccionados.');
        }

        // 3. RUN QUEUE FOR OCR & PDF TEXT EXTRACTION
        updateProgress(30, 'Iniciando procesamiento de documentos...');
        
        const hasImages = filesToProcess.some(e => !e.isPdf);
        const hasPdfs = filesToProcess.some(e => e.isPdf);
        let worker = null;
        if (hasImages || hasPdfs) {
            addLog('Cargando Tesseract.js para procesar imágenes/PDFs escaneados...', 'info');
            worker = await Tesseract.createWorker('spa+eng');
            addLog('Motor de OCR listo.', 'success');
        }

        const totalFiles = filesToProcess.length;
        for (let idx = 0; idx < totalFiles; idx++) {
            const fileEntry = filesToProcess[idx];
            const percentStart = 30 + Math.round((idx / totalFiles) * 65);
            
            updateProgress(percentStart, `Procesando: ${fileEntry.name} (${idx + 1} de ${totalFiles})...`);
            
            if (fileEntry.isPdf) {
                addLog(`Procesando archivo PDF: ${fileEntry.name}...`, 'info');
                try {
                    const loadingTask = pdfjsLib.getDocument({data: fileEntry.arrayBuffer});
                    const pdf = await loadingTask.promise;
                    const numPages = pdf.numPages;
                    addLog(`El PDF ${fileEntry.name} tiene ${numPages} página(s).`, 'info');
                    
                    for (let p = 1; p <= numPages; p++) {
                        const pageLabel = numPages > 1 ? ` (Pág. ${p})` : '';
                        const pageItemName = `${fileEntry.name}${pageLabel}`;
                        addLog(`Extrayendo texto de: ${pageItemName}...`, 'info');
                        
                        let text = await extractPdfPageText(pdf, p);
                        let imageSrc = "";
                        let base64 = "";
                        
                        try {
                            imageSrc = await convertPdfPageToImage(pdf, p);
                            base64 = imageSrc;
                        } catch (renderErr) {
                            console.error(`Error rendering PDF page ${p} to image:`, renderErr);
                            base64 = await blobToBase64(fileEntry.blob);
                            imageSrc = base64;
                        }
                        
                        // Fallback to OCR if page has little text (scanned PDF page)
                        if (text.trim().length < 20 && imageSrc && worker) {
                            addLog(`Página ${p} del PDF ${fileEntry.name} tiene poco texto digital. Ejecutando OCR optimizado con preprocesamiento...`, 'info');
                            try {
                                const ocrResult = await runSmartOCR(worker, imageSrc, pageItemName);
                                text = ocrResult.text;
                                addLog(`OCR finalizado para ${pageItemName} (Confianza: ${ocrResult.confidence}%).`, 'success');
                            } catch (ocrErr) {
                                console.error("OCR error on PDF page:", ocrErr);
                            }
                        }
                        
                        const docDetails = classifyAndExtractDocument(text, pageItemName);
                        
                        // Check low quality per page
                        let isLowQuality = (text.trim().length < 40 && docDetails.docType === 'invoice' && !docDetails.amount && !docDetails.date);
                        
                        addLog(`[Procesado] "${pageItemName}": Tipo: ${docDetails.docType.toUpperCase()}, Ref: ${docDetails.invoiceRef || '---'}, Monto: ${docDetails.amount ? window.formatCurrency(docDetails.amount, docDetails.currency) : '---'}`, 'success');
                        
                        ReconState.invoices.push({
                            name: pageItemName,
                            imageSrc: imageSrc,
                            base64: base64,
                            blob: fileEntry.blob,
                            pageNum: p,
                            text: text,
                            docType: docDetails.docType,
                            invoiceRef: docDetails.invoiceRef,
                            baseAmount: docDetails.baseAmount,
                            withheldAmount: docDetails.withheldAmount,
                            extractedAmount: docDetails.amount,
                            extractedSubtotal: docDetails.subtotal,
                            extractedDateStr: docDetails.dateStr,
                            extractedDate: docDetails.date,
                            currency: docDetails.currency,
                            purchaseOrderRef: docDetails.purchaseOrderRef || null,
                            providerRuc: docDetails.providerRuc || null,
                            hasSinsaRuc: docDetails.hasSinsaRuc || false,
                            matched: false,
                            lowQuality: isLowQuality,
                            confidence: 100
                        });
                    }
                } catch (pdfErr) {
                    addLog(`Error al abrir PDF ${fileEntry.name}: ${pdfErr.message}`, 'error');
                }
            } else {
                // Image file
                addLog(`Procesando imagen: ${fileEntry.name}...`, 'info');
                try {
                    const base64 = await blobToBase64(fileEntry.blob);
                    const imageSrc = base64;
                    
                    addLog(`Optimizando imagen y ejecutando OCR Inteligente: ${fileEntry.name}...`, 'info');
                    let text = "";
                    let confidence = 0;
                    if (worker) {
                        const ocrResult = await runSmartOCR(worker, imageSrc, fileEntry.name);
                        text = ocrResult.text;
                        confidence = ocrResult.confidence || 0;
                    }
                    
                    const docDetails = classifyAndExtractDocument(text, fileEntry.name);
                    const isLowQuality = (confidence < 45) || (text.trim().length < 40 && docDetails.docType === 'invoice' && !docDetails.amount && !docDetails.date);
                    
                    addLog(`[Procesado] "${fileEntry.name}": Tipo: ${docDetails.docType.toUpperCase()}, Ref: ${docDetails.invoiceRef || '---'}, Monto: ${docDetails.amount ? window.formatCurrency(docDetails.amount, docDetails.currency) : '---'} (OCR: ${confidence}%)`, 'success');
                    
                    ReconState.invoices.push({
                        name: fileEntry.name,
                        imageSrc: imageSrc,
                        base64: base64,
                        blob: fileEntry.blob,
                        text: text,
                        docType: docDetails.docType,
                        invoiceRef: docDetails.invoiceRef,
                        baseAmount: docDetails.baseAmount,
                        withheldAmount: docDetails.withheldAmount,
                        extractedAmount: docDetails.amount,
                        extractedSubtotal: docDetails.subtotal,
                        extractedDateStr: docDetails.dateStr,
                        extractedDate: docDetails.date,
                        currency: docDetails.currency,
                        purchaseOrderRef: docDetails.purchaseOrderRef || null,
                        providerRuc: docDetails.providerRuc || null,
                        hasSinsaRuc: docDetails.hasSinsaRuc || false,
                        matched: false,
                        lowQuality: isLowQuality,
                        confidence: confidence
                    });
                    
                    if (isLowQuality) {
                        addLog(`Advertencia en archivo "${fileEntry.name}": Baja legibilidad detectada (Confianza OCR: ${confidence}%).`, 'warning');
                    }
                } catch (imgErr) {
                    addLog(`Error al procesar imagen ${fileEntry.name}: ${imgErr.message}`, 'error');
                }
            }
        }

        if (worker) {
            await worker.terminate();
            addLog('Motor de OCR finalizado y liberado.', 'success');
        }

        // 4. RUN MATCHING ALGORITHM
        updateProgress(95, 'Conciliando transacciones e impuestos...');
        addLog('Iniciando proceso de conciliación por monto y fecha...', 'info');
        
        runMatchingAlgorithm();
        
        // Finalize UI
        updateProgress(100, '¡Proceso completado!');
        addLog('Conciliación terminada con éxito.', 'success');
        
        setTimeout(() => {
            reconElements.panelProgress.classList.add('hidden');
            renderReconciliationUI();
        }, 1000);

    } catch (error) {
        console.error(error);
        addLog(`Fallo en el proceso: ${error.message}`, 'error');
        updateProgress(0, 'Error en el procesamiento');
        reconElements.progressFill.style.backgroundColor = 'var(--color-danger)';
        window.showToast(`Error al procesar: ${error.message}`, 'error');
    }
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

// --- ADVANCED IMAGE PREPROCESSING PIPELINE FOR OCR ---

function loadImageElement(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = src;
    });
}

/**
 * Advanced local canvas image preprocessor:
 * 1. Smart bicubic upscaling to guarantee high character pixel density.
 * 2. Grayscale conversion with human luminance weighting.
 * 3. Dynamic contrast normalization (histogram stretching).
 * 4. Adaptive local window binarization (Bradley-Roth algorithm) to remove shadows and creases.
 */
async function preprocessImageForOCR(imageSrc, mode = 'adaptive') {
    try {
        const img = await loadImageElement(imageSrc);
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;
        if (!origW || !origH) return imageSrc;

        // 1. Calculate Target Scale (aim for 1800 - 2400px width/height for optimal OCR text height)
        let scale = 1.0;
        const minDim = Math.min(origW, origH);
        const maxDim = Math.max(origW, origH);
        if (minDim < 1400) {
            scale = Math.min(2.5, Math.max(1.4, 1800 / minDim));
        } else if (maxDim > 3200) {
            scale = 3200 / maxDim;
        }

        const width = Math.round(origW * scale);
        const height = Math.round(origH * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const totalPixels = width * height;
        const gray = new Uint8Array(totalPixels);

        // 2. Grayscale conversion
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            gray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        }

        if (mode === 'grayscale_only') {
            for (let i = 0, p = 0; i < data.length; i += 4, p++) {
                const g = gray[p];
                data[i] = g;
                data[i + 1] = g;
                data[i + 2] = g;
            }
            ctx.putImageData(imgData, 0, 0);
            return canvas.toDataURL('image/png');
        }

        // 3. Contrast Stretching (Calculate 2nd and 98th percentiles)
        const hist = new Int32Array(256);
        for (let p = 0; p < totalPixels; p++) {
            hist[gray[p]]++;
        }
        
        let countLow = 0, countHigh = 0;
        const targetLow = Math.round(totalPixels * 0.02);
        const targetHigh = Math.round(totalPixels * 0.98);
        let minLum = 0, maxLum = 255;
        
        for (let i = 0; i < 256; i++) {
            countLow += hist[i];
            if (countLow >= targetLow) { minLum = i; break; }
        }
        for (let i = 255; i >= 0; i--) {
            countHigh += hist[i];
            if (countHigh >= totalPixels - targetHigh) { maxLum = i; break; }
        }
        if (maxLum <= minLum) { minLum = 0; maxLum = 255; }
        
        const range = maxLum - minLum;
        const stretched = new Uint8Array(totalPixels);
        for (let p = 0; p < totalPixels; p++) {
            const v = gray[p];
            if (v <= minLum) stretched[p] = 0;
            else if (v >= maxLum) stretched[p] = 255;
            else stretched[p] = Math.round(((v - minLum) / range) * 255);
        }

        // 4. Bradley-Roth Adaptive Thresholding using Integral Image
        const integral = new Float64Array(totalPixels);
        for (let y = 0; y < height; y++) {
            let sum = 0;
            const rowOffset = y * width;
            for (let x = 0; x < width; x++) {
                sum += stretched[rowOffset + x];
                integral[rowOffset + x] = (y === 0 ? sum : integral[rowOffset - width + x] + sum);
            }
        }

        const S = Math.max(16, Math.round(width / 16));
        const s2 = Math.round(S / 2);
        const T = 0.14; // Threshold factor (14% below local neighborhood mean)

        for (let y = 0; y < height; y++) {
            const y1 = Math.max(0, y - s2);
            const y2 = Math.min(height - 1, y + s2);
            const rowOffset = y * width;
            
            for (let x = 0; x < width; x++) {
                const x1 = Math.max(0, x - s2);
                const x2 = Math.min(width - 1, x + s2);
                const count = (x2 - x1 + 1) * (y2 - y1 + 1);

                const sum = integral[y2 * width + x2] -
                            (x1 > 0 ? integral[y2 * width + x1 - 1] : 0) -
                            (y1 > 0 ? integral[(y1 - 1) * width + x2] : 0) +
                            (x1 > 0 && y1 > 0 ? integral[(y1 - 1) * width + x1 - 1] : 0);

                const pixelVal = stretched[rowOffset + x];
                const pixelIndex = (rowOffset + x) * 4;

                // If pixel is significantly darker than local average, it's text (0), else background (255)
                if (pixelVal * count < sum * (1.0 - T)) {
                    data[pixelIndex] = 0;
                    data[pixelIndex + 1] = 0;
                    data[pixelIndex + 2] = 0;
                } else {
                    data[pixelIndex] = 255;
                    data[pixelIndex + 1] = 255;
                    data[pixelIndex + 2] = 255;
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
    } catch (err) {
        console.warn('Preprocessing failed, using raw image:', err);
        return imageSrc;
    }
}

/**
 * Multi-Pass Smart OCR Engine
 */
async function runSmartOCR(worker, imageSrc, fileName = "") {
    if (!worker) return { text: "", confidence: 0 };
    
    try {
        // Pass 1: Run with Adaptive Local Thresholding & Upscaling
        const preprocessedSrc = await preprocessImageForOCR(imageSrc, 'adaptive');
        const res1 = await worker.recognize(preprocessedSrc);
        const text1 = res1.data.text || "";
        const conf1 = res1.data.confidence || 0;

        // Check if Pass 1 yielded a strong extraction
        const details1 = classifyAndExtractDocument(text1, fileName);
        const hasGoodData = (details1.amount !== null || details1.invoiceRef !== null) && text1.trim().length >= 40 && conf1 >= 50;

        if (hasGoodData) {
            return { text: text1, confidence: conf1, preprocessedSrc: preprocessedSrc };
        }

        // Pass 2: Fallback on Grayscale-Normalized Image if Pass 1 had low confidence
        const graySrc = await preprocessImageForOCR(imageSrc, 'grayscale_only');
        const res2 = await worker.recognize(graySrc);
        const text2 = res2.data.text || "";
        const conf2 = res2.data.confidence || 0;
        const details2 = classifyAndExtractDocument(text2, fileName);

        // Pick whichever pass extracted amount/date or higher confidence
        if ((details2.amount && !details1.amount) || (conf2 > conf1 && text2.trim().length > text1.trim().length)) {
            return { text: text2, confidence: conf2, preprocessedSrc: graySrc };
        }

        return { text: text1, confidence: conf1, preprocessedSrc: preprocessedSrc };
    } catch (ocrErr) {
        console.error("Smart OCR error:", ocrErr);
        // Direct fallback to raw
        try {
            const rawRes = await worker.recognize(imageSrc);
            return { text: rawRes.data.text || "", confidence: rawRes.data.confidence || 0 };
        } catch (rawErr) {
            return { text: "", confidence: 0 };
        }
    }
}

async function convertPdfPageToImage(pdf, pageNum) {
    if (pdf.numPages < pageNum) return null;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };
    await page.render(renderContext).promise;
    return canvas.toDataURL('image/jpeg');
}

async function convertPdfToImage(pdfData) {
    const loadingTask = pdfjsLib.getDocument({data: pdfData});
    const pdf = await loadingTask.promise;
    return await convertPdfPageToImage(pdf, 1);
}

async function extractPdfPageText(pdf, pageNum) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Reconstruct line layout sorting by coordinates
    const lines = {};
    textContent.items.forEach(item => {
        // Group items into virtual lines based on Y coordinate (rounded to nearest 4px)
        const y = Math.round(item.transform[5] / 4) * 4;
        if (!lines[y]) {
            lines[y] = [];
        }
        lines[y].push(item);
    });

    // Sort Y lines top to bottom
    const sortedY = Object.keys(lines).sort((a, b) => b - a);
    let pageText = "";
    sortedY.forEach(y => {
        // Sort X positions inside each line
        const lineItems = lines[y].sort((a, b) => a.transform[4] - b.transform[4]);
        const lineStr = lineItems.map(item => item.str).join(" ");
        pageText += lineStr + "\n";
    });
    return pageText;
}

// Extractor with Layout-Aware sorting to reconstruct rows cleanly
async function extractPdfText(pdfData) {
    const loadingTask = pdfjsLib.getDocument({data: pdfData});
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        fullText += await extractPdfPageText(pdf, i) + "\n";
    }

    return fullText;
}

// --- TEXT PARSERS (BANPRO STATEMENT) ---

async function parseTransactionsWithCoordinates(pdfData) {
    const loadingTask = pdfjsLib.getDocument({data: pdfData});
    const pdf = await loadingTask.promise;
    let idCounter = 1;
    
    // Default fiscal year from statement text if detected
    let statementYear = new Date().getFullYear();
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const items = textContent.items;
        
        if (items.length === 0) continue;
        
        // Scan page elements for year and column X centers
        let xCordobas = null;
        let xDolares = null;
        
        items.forEach(item => {
            const text = item.str.toLowerCase();
            if (text.includes('cordoba') || text.includes('cór')) {
                xCordobas = item.transform[4];
            }
            if (text.includes('dolar') || text.includes('dól') || text.includes('usd')) {
                xDolares = item.transform[4];
            }
            const yearMatch = text.match(/\b(202\d)\b/);
            if (yearMatch) {
                statementYear = parseInt(yearMatch[1], 10);
            }
        });
        
        // Typical coordinates in BANPRO statements if not found on current page
        if (!xCordobas) xCordobas = 460;
        if (!xDolares) xDolares = 540;
        
        // Group page text elements vertically (Y coordinates rounded to 4px)
        const lines = {};
        items.forEach(item => {
            const y = Math.round(item.transform[5] / 4) * 4;
            if (!lines[y]) {
                lines[y] = [];
            }
            lines[y].push(item);
        });
        
        const sortedY = Object.keys(lines).sort((a, b) => b - a);
        
        sortedY.forEach(y => {
            const lineItems = lines[y].sort((a, b) => a.transform[4] - b.transform[4]);
            const lineText = lineItems.map(item => item.str).join(" ");
            const trimmed = lineText.trim();
            
            if (trimmed.length < 10) return;
            
            // BANPRO purchase line regex: Reference (10-25 digits) | Date (MM/DD) | Description | Amount
            const banproRegex = /^(\d{10,25})\s+(\d{1,2}[\/\-]\d{1,2})\s+(.+?)\s+([\-\+]?\$?\s*[\d,]+\.\d{2})(?:\s*(?:CR|DR|\-))?\s*$/i;
            
            const match = trimmed.match(banproRegex);
            if (match) {
                const refNum = match[1];
                const dateStr = match[2];
                const desc = match[3].trim();
                const amountVal = match[4];
                
                let cleanAmount = amountVal.replace(/[\$,\s]/g, '');
                let amount = parseFloat(cleanAmount);
                if (isNaN(amount)) return;
                
                const descLower = desc.toLowerCase();
                const isIgnored = descLower.includes('saldo') || 
                                  descLower.includes('pago a su tarjeta') ||
                                  descLower.includes('su pago gracias') || 
                                  descLower.includes('comision total') ||
                                  descLower.includes('total de cargos') ||
                                  descLower.includes('total cargos') ||
                                  descLower.includes('total creditos') ||
                                  descLower.includes('total de creditos') ||
                                  descLower.includes('intereses bonificados') ||
                                  descLower.includes('interes corriente') ||
                                  descLower.includes('subtotal') ||
                                  descLower.includes('cargo por mora') ||
                                  descLower.includes('limite') ||
                                  descLower.includes('límite') ||
                                  descLower.includes('corte') ||
                                  descLower.includes('pago limite') ||
                                  descLower.includes('pago límite') ||
                                  descLower.includes('fecha limite') ||
                                  descLower.includes('fecha límite') ||
                                  descLower.includes('fecha de corte') ||
                                  /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(desc) ||
                                  /^\d{1,2}[\/\-]\d{1,2}\s+[uU]\$?/.test(desc);
                                  
                if (isIgnored) return;
                
                // Identify amount item's horizontal coordinate
                let amountX = null;
                for (let k = lineItems.length - 1; k >= 0; k--) {
                    if (lineItems[k].str.includes(amountVal) || amountVal.includes(lineItems[k].str)) {
                        amountX = lineItems[k].transform[4];
                        break;
                    }
                }
                
                if (amountX === null && lineItems.length > 0) {
                    amountX = lineItems[lineItems.length - 1].transform[4];
                }
                
                // Proximity check to headers
                let currency = 'NIO';
                if (amountX !== null) {
                    const distNIO = Math.abs(amountX - xCordobas);
                    const distUSD = Math.abs(amountX - xDolares);
                    if (distUSD < distNIO) {
                        currency = 'USD';
                    }
                }
                
                if (desc.endsWith(' US') || desc.includes('USD')) {
                    currency = 'USD';
                }

                // Date parsing MM/DD
                let dateObj = null;
                if (dateStr.includes('/') && dateStr.split('/').length === 2) {
                    const parts = dateStr.split('/');
                    let month = parseInt(parts[0], 10);
                    let day = parseInt(parts[1], 10);
                    if (month > 12) {
                        const tmp = month;
                        month = day;
                        day = tmp;
                    }
                    dateObj = new Date(statementYear, month - 1, day);
                } else {
                    dateObj = window.parseLocaleDate(dateStr);
                }
                
                ReconState.transactions.push({
                    id: 'tx-' + idCounter++,
                    dateStr: dateStr,
                    date: dateObj,
                    description: desc,
                    amount: Math.abs(amount),
                    type: (trimmed.endsWith('CR') || trimmed.endsWith('-') || amount < 0 || descLower.includes('bonific') || descLower.includes('devoluc') || descLower.includes('nota de cred') || descLower.includes('credito') || descLower.includes('crédito')) ? 'credit' : 'charge',
                    matched: false,
                    invoice: null,
                    reference: refNum,
                    currency: currency
                });
            }
        });
    }
}

function normalizeTextForClassification(str) {
    if (!str) return "";
    return str.toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "") // Remove accents
              .replace(/\s+/g, " ") // Normalize white spaces
              .trim();
}

/**
 * Intelligent Nicaraguan RUC & Cédula Extractor
 * Matches:
 * 1. Explicit labels: "RUC: J0310000001812", "R.U.C. No. 001-200785-0012Y", "RUC # J0310000123456"
 * 2. Persona Jurídica format: J followed by 13 digits (e.g. J0310000001812, J-0310-000001812)
 * 3. Persona Natural format: Cédula (e.g. 001-200785-0012Y)
 */
function extractRUC(text, textNorm) {
    if (!text) return null;
    const cleanText = text.replace(/[\r\n]+/g, ' ');
    
    // 1. Direct label pattern: "RUC: J0310000001812", "R.U.C No. 001-200785-0012Y", "RUC: 0012007850012Y"
    const labelMatch = cleanText.match(/(?:r\s*[\.\/]?\s*u\s*[\.\/]?\s*c|c[eé]dula|identificaci[o0]n|reg(?:istro)?\s*tributario)\s*[:#\.\s-]*([A-Za-z0-9\s\-–]{13,22})/i);
    if (labelMatch) {
        const candidate = labelMatch[1].replace(/[\s\-–\.]/g, '').toUpperCase();
        if (/^[JG]\d{13}$/.test(candidate) || /^\d{13}[A-Z0-9]$/.test(candidate)) {
            return candidate;
        }
        if (candidate.length >= 13 && candidate.length <= 15) {
            return candidate;
        }
    }
    
    // 2. Persona Jurídica format (J + 13 digits)
    const pjMatch = cleanText.match(/\b([JjGg]\s*[-–]?\s*\d{4}\s*[-–]?\s*\d{6}\s*[-–]?\s*\d{3,4})\b/);
    if (pjMatch) {
        const candidate = pjMatch[1].replace(/[\s\-–\.]/g, '').toUpperCase();
        if (candidate.length >= 13 && candidate.length <= 15) {
            return candidate;
        }
    }
    
    // 3. Persona Natural format (Cédula: 001-200785-0012Y)
    const pnMatch = cleanText.match(/\b(\d{3}\s*[-–]?\s*\d{6}\s*[-–]?\s*\d{4}[A-Za-z0-9])\b/);
    if (pnMatch) {
        const candidate = pnMatch[1].replace(/[\s\-–\.]/g, '').toUpperCase();
        if (candidate.length >= 13 && candidate.length <= 15) {
            return candidate;
        }
    }
    
    return null;
}

function classifyAndExtractDocument(text, fileName) {
    const textLower = text.toLowerCase();
    const textNorm = normalizeTextForClassification(text);
    const fileNorm = normalizeTextForClassification(fileName);
    
    // 1. SCORING SYSTEM FOR CLASSIFICATION
    let retentionScore = 0;
    let invoiceScore = 0;
    let purchaseOrderScore = 0;
    
    // --- Retention/Exemption Heuristics (using regex to tolerate OCR typos) ---
    const hasConstancia = /constancia\s+(?:de\s+)?retenci[o0]n/i.test(textNorm);
    const hasRetencionMunicipal = /retenci[o0]n\s+(?:de\s+)?municip[a1]l/i.test(textNorm) || /retenci[o0]n\s+municip[a1]l/i.test(textNorm) || /municipal\s+de\s+managu[a1]/i.test(textNorm);
    const hasImpuestoRenta = /impuesto[s]?\s+sobre\s+l[a1]\s+rent[a1]/i.test(textNorm) || /impuesto[s]?\s+sobre\s+rent[a1]/i.test(textNorm) || /retenci[o0]n\s+impuesto/i.test(textNorm);
    const hasDecreto = /decreto\s+31\s*[-–]?\s*90/i.test(textNorm);
    const hasExemptionHeader = /exenci[o0]n\s+(?:de\s+)?impuesto/i.test(textNorm) || /constancia\s+(?:de\s+)?exenci[o0]n/i.test(textNorm) || /resoluci[o0]n\s+(?:de\s+)?exenci[o0]n/i.test(textNorm);
    
    if (hasConstancia) retentionScore += 15;
    if (hasRetencionMunicipal) retentionScore += 15;
    if (hasImpuestoRenta) retentionScore += 12;
    if (hasDecreto) retentionScore += 10;
    if (hasExemptionHeader) retentionScore += 15;
    
    // Form fields specific to withholding tax vouchers
    const hasNombreRetenido = /nombre\s+(?:del\s+)?retenid[o0]/i.test(textNorm);
    const hasRucRetenido = /ruc\s+(?:del\s+)?retenid[o0]/i.test(textNorm);
    const hasValorImponible = /valor\s+imponible/i.test(textNorm) || /monto\s+imponible/i.test(textNorm);
    const hasMontoRetenido = /(?:monto|valor|total|retenid[o0])\s+retenid[o0]/i.test(textNorm) || /retenid[o0]c\$/i.test(textNorm);
    const hasValorFactura = /valor\s+(?:de\s+la\s+)?factur[a1]/i.test(textNorm) || /valor\s+factur[a1]/i.test(textNorm);
    const hasAgenteRetencion = /agente\s+(?:de\s+)?retenci[o0]n/i.test(textNorm);
    const hasRetencionIrWord = /retenci[o0]n\s+i\s*[\.]?\s*r\s*[\.]?/i.test(textNorm) || /retenci[o0]n\s+ir/i.test(textNorm);
    const hasRetenidoSymbol = /retenid[o0]\s*(?:c\$|\$)/i.test(textNorm);
    
    if (hasNombreRetenido) retentionScore += 8;
    if (hasRucRetenido) retentionScore += 8;
    if (hasValorImponible) retentionScore += 8;
    if (hasMontoRetenido) retentionScore += 8;
    if (hasValorFactura) retentionScore += 6;
    if (hasAgenteRetencion) retentionScore += 8;
    if (hasRetencionIrWord) retentionScore += 8;
    if (hasRetenidoSymbol) retentionScore += 8;
    
    // Accidental matchers (loose checks, only if not in disclaimers)
    const hasSomosExentos = /somos\s+exent[o0]s/i.test(textNorm);
    const hasParaSolicitar = /para\s+solicitar\s+constancia/i.test(textNorm);
    
    if (/retenci[o0]n/i.test(textNorm) && !hasSomosExentos && !hasParaSolicitar) {
        retentionScore += 3;
    }
    if (/exent[o0]/i.test(textNorm) && !hasSomosExentos && !hasParaSolicitar) {
        retentionScore += 3;
    }
    
    // Filename indicators
    if (fileNorm.includes("retencion") || fileNorm.includes("constancia") || fileNorm.includes("exencion")) {
        retentionScore += 20;
    }
    
    // --- Purchase Order (Orden de Compra / OC) Heuristics ---
    const hasOrdenCompra = /orden\s+(?:de\s+)?compra/i.test(textNorm) || /purchase\s+order/i.test(textNorm) || /^(?:.*\n)?\s*orden\s+no\b/im.test(textNorm);
    const hasPedidoCompra = /pedido\s+(?:de\s+)?compra/i.test(textNorm);
    
    if (hasOrdenCompra) purchaseOrderScore += 30;
    if (hasPedidoCompra) purchaseOrderScore += 15;
    
    // Strict filename check for purchase order
    if (/(?:^|[^a-z0-9])(?:orden[-_ ]?de[-_ ]?compra|purchase[-_ ]?order)(?:[^a-z0-9]|$)/i.test(fileName)) {
        purchaseOrderScore += 25;
    }

    // --- Invoice Heuristics ---
    const hasFacturaContado = /factur[a1]\s+contad[o0]/i.test(textNorm);
    const hasFacturaCredito = /factur[a1]\s+(?:de\s+)?credit[o0]/i.test(textNorm);
    const hasFacturaNo = /factur[a1]\s*(?:n[o°\.]|#|numero)/i.test(textNorm);
    const hasCliente = /cliente\s*[:\s]/i.test(textNorm) || /nombre\s+(?:del\s+)?cliente/i.test(textNorm);
    const hasFacturadoA = /facturad[o0]\s+a/i.test(textNorm);
    const hasSubtotal = /sub[-]?total/i.test(textNorm) || /sub\s+total/i.test(textNorm);
    const hasTotalPagar = /(?:total|neto|monto)\s+(?:a\s+)?pagar/i.test(textNorm);
    const hasIva = /iva\s*(?:15%|\(15%\))/i.test(textNorm) || /impuesto\s+(?:al\s+)?valor\s+agregad[o0]/i.test(textNorm);
    const hasInvoiceTable = /descripci[o0]n/i.test(textNorm) && (/(?:cant|cantidad)/i.test(textNorm) || /(?:precio|p\.\s*unit)/i.test(textNorm));
    const hasReciboCaja = /recib[o0]\s+(?:oficial\s+)?(?:de\s+)?caj[a1]/i.test(textNorm);
    
    if (hasFacturaContado) invoiceScore += 15;
    if (hasFacturaCredito) invoiceScore += 15;
    if (hasFacturaNo) invoiceScore += 10;
    if (hasCliente) invoiceScore += 5;
    if (hasFacturadoA) invoiceScore += 8;
    if (hasSubtotal) invoiceScore += 8;
    if (hasTotalPagar) invoiceScore += 8;
    if (hasIva) invoiceScore += 8;
    if (hasInvoiceTable) invoiceScore += 10;
    if (hasReciboCaja) invoiceScore += 10;
    
    // Filename indicators
    if (fileNorm.includes("factura") || fileNorm.includes("invoice") || fileNorm.includes("compra") || fileNorm.includes("recibo") || fileNorm.includes("ticket") || fileNorm.includes("voucher")) {
        invoiceScore += 20;
    }
    
    // --- Decision Logic ---
    let docType = 'invoice';
    if (purchaseOrderScore > invoiceScore && purchaseOrderScore > retentionScore && purchaseOrderScore >= 25) {
        docType = 'orden_compra';
    } else if (retentionScore > invoiceScore && retentionScore >= 8) {
        const isExemption = hasExemptionHeader || textNorm.includes("exencion") || textNorm.includes("exento") || fileNorm.includes("exencion");
        
        if (isExemption && !hasConstancia) {
            const mentionsDGI = /dgi|renta|impuesto\s+sobre|hacienda/i.test(textNorm) || fileNorm.includes("dgi");
            const mentionsALMA = /alma|alcaldia|municipal|alcald[ií]a/i.test(textNorm) || fileNorm.includes("alma") || fileNorm.includes("municipal");
            if (mentionsDGI && !mentionsALMA) {
                docType = 'exencion_dgi';
            } else if (mentionsALMA && !mentionsDGI) {
                docType = 'exencion_alma';
            } else {
                docType = 'exencion';
            }
        } else if (isMunicipal) {
            docType = 'retencion_municipal';
        } else {
            docType = 'retencion_ir';
        }
    }
    
    // Guess currency: default to NIO unless there's an explicit USD keyword/symbol
    let currency = 'NIO';
    const hasNIO = /c\s*\$|c\s*s\s*\$|cordoba|córdoba|cór/i.test(textLower) || 
                    /\bruc\b/i.test(textLower) ||
                    /\biva\b/i.test(textLower) ||
                    /retencion|retención/i.test(textLower) ||
                    /alcaldia|alcaldía/i.test(textLower) ||
                    fileName.toLowerCase().includes('nio') || 
                    fileName.toLowerCase().includes('cordoba') || 
                    fileName.toLowerCase().includes('cs');
    const hasUSD = /\b(usd|dolar|dólar|dollar|dolares|dólares|dollars)\b/i.test(textLower) || 
                    /\bus\s*\$/i.test(textLower) || 
                    /u\.s\.\s*\$/i.test(textLower) ||
                    fileName.toLowerCase().includes('usd');
    if (hasUSD && !hasNIO) {
        currency = 'USD';
    }
    
    // Extract referenced invoice number from retentions (e.g. "# 18805")
    let invoiceRef = null;
    const invMatch = text.match(/(?:facturas?|recibos?|factura n[o°\.]|factura #|#)\s*(?:#|no\.)?\s*(\d{4,10})/i);
    if (invMatch) {
        invoiceRef = invMatch[1];
    }
    
    let baseAmount = null;
    let withheldAmount = null;
    
    if (docType === 'retencion_ir' || docType === 'retencion_municipal') {
        // Base amount imponible
        const baseMatch = text.match(/(?:valor imponible|valor de la factura|valor factura|monto imponible|imponible)\s*(?:c\$|\$)?\s*([\d,]+\.\d{2})/i);
        if (baseMatch) {
            baseAmount = parseFloat(baseMatch[1].replace(/,/g, ''));
        }
        
        // Withheld amount
        const withheldMatch = text.match(/(?:valor retenido|monto retenido|total retenido|retenido c\$|retenido \$)\s*(?:c\$|\$)?\s*([\d,]+\.\d{2})/i);
        if (withheldMatch) {
            withheldAmount = parseFloat(withheldMatch[1].replace(/,/g, ''));
        }
    }
    
    let amount = null;
    let subtotal = null;
    let date = null;
    let dateStr = "";
    let purchaseOrderRef = null;
    let hasSinsaRuc = false;
    
    if (docType === 'invoice') {
        const details = extractInvoiceDetails(text, fileName);
        amount = details.amount;
        subtotal = details.subtotal;
        date = details.date;
        dateStr = details.dateStr;
        
        // Invoice own number
        const ownInvMatch = text.match(/(?:factura n[o°\.]|factura #|no\.|factura|#)\s*(?:#|no\.)?\s*(\d{4,10})/i);
        if (ownInvMatch) {
            invoiceRef = ownInvMatch[1];
        }
        
        // Extract Vendor RUC
        const rucCandidate = extractRUC(text, textNorm);
        if (rucCandidate) {
            hasSinsaRuc = true;
        }
    } else if (docType === 'orden_compra') {
        const details = extractInvoiceDetails(text, fileName);
        amount = details.amount;
        subtotal = details.subtotal;
        date = details.date;
        dateStr = details.dateStr;
        
        // Extracción de número de OC
        const poMatch = text.match(/(?:orden\s+(?:de\s+)?compra|purchase\s+order|o\s*[\.\/]?\s*c)\s*(?:n[o°\.]|#|numero)?\s*(\d{3,10})/i);
        if (poMatch) {
            purchaseOrderRef = poMatch[1];
        }
    }

    const providerRuc = extractRUC(text, textNorm);

    return {
        docType,
        invoiceRef,
        baseAmount,
        withheldAmount,
        amount,
        subtotal,
        date,
        dateStr,
        currency,
        purchaseOrderRef: purchaseOrderRef || null,
        providerRuc: providerRuc || null,
        hasSinsaRuc: !!providerRuc
    };
}

function extractInvoiceDetails(text, fileName) {
    let amount = null;
    let date = null;
    let dateStr = "";

    // 1. EXTRACT DATE
    let targetYear = new Date().getFullYear();
    if (window.ReconState && window.ReconState.transactions && window.ReconState.transactions.length > 0) {
        const firstTx = window.ReconState.transactions.find(t => t.date);
        if (firstTx) {
            targetYear = firstTx.date.getFullYear();
        }
    }

    const dateRegexes = [
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g, // 25/05/2026 or 25-05-2026
        /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/gi
    ];

    let foundDate = null;
    let foundDateStr = "";

    for (const rx of dateRegexes) {
        rx.lastIndex = 0; // reset regex state
        let match;
        while ((match = rx.exec(text)) !== null) {
            let d, m, y;
            if (match[2].match(/^[a-zA-Z]/i)) {
                const months = {
                    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
                    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
                };
                m = months[match[2].toLowerCase()];
                d = parseInt(match[1], 10);
                y = parseInt(match[3], 10);
            } else {
                d = parseInt(match[1], 10);
                m = parseInt(match[2], 10) - 1;
                y = parseInt(match[3], 10);
                if (y < 100) y += 2000;
            }

            // Validate date is real and the year is close to the statement's transaction year (within 1 year tolerance)
            if (d >= 1 && d <= 31 && m >= 0 && m <= 11 && Math.abs(y - targetYear) <= 1) {
                foundDate = new Date(y, m, d);
                foundDateStr = `${d}/${m+1}/${y}`;
                break;
            }
        }
        if (foundDate) break;
    }

    if (foundDate) {
        date = foundDate;
        dateStr = foundDateStr;
    }

    // 2. EXTRACT AMOUNT
    const lines = text.split('\n');
    const totalLines = [];
    
    lines.forEach(line => {
        // filter lines likely containing total amount
        if (/total|pagar|neto|importe|monto|net\s+pay|sub-total|efectivo/i.test(line)) {
            totalLines.push(line);
        }
    });

    let foundAmounts = [];
    totalLines.forEach(line => {
        const matches = line.match(/([\d,]+\.\d{2})/g);
        if (matches) {
            matches.forEach(m => {
                const val = parseFloat(m.replace(/,/g, ''));
                if (!isNaN(val) && val > 0) {
                    foundAmounts.push(val);
                }
            });
        }
    });

    if (foundAmounts.length > 0) {
        amount = Math.max(...foundAmounts);
    } else {
        // Fallback to highest float found in entire document
        const allMatches = text.match(/([\d,]+\.\d{2})/g);
        if (allMatches) {
            const vals = allMatches.map(m => parseFloat(m.replace(/,/g, ''))).filter(v => !isNaN(v) && v > 0);
            if (vals.length > 0) {
                amount = Math.max(...vals);
            }
        }
    }

    // If still null, try filename parsing, but skip for WhatsApp files (as WhatsApp filenames only contain timestamp)
    if (!amount && !fileName.toLowerCase().includes('whatsapp')) {
        let cleanName = fileName.replace(/202\d-\d{2}-\d{2}/gi, '');
        cleanName = cleanName.replace(/\b202\d\b/g, ''); // remove the year (e.g. 2026)
        cleanName = cleanName.replace(/\(\d+\)/g, ''); // skip sequence numbers like (1), (2)
        
        const fileMatch = cleanName.match(/(\d+(?:\.\d{2})?)/);
        if (fileMatch) {
            const parsedAmt = parseFloat(fileMatch[1]);
            // Only use if it looks like a reasonable amount (not a single digit index, e.g. > 9 or with decimals)
            if (parsedAmt > 9 || fileMatch[1].includes('.')) {
                amount = parsedAmt;
            }
        }
    }

    // 3. EXTRACT SUBTOTAL
    let subtotal = null;
    const subtotalLines = [];
    lines.forEach(line => {
        if (/sub-total|subtotal|sub\s+total/i.test(line)) {
            subtotalLines.push(line);
        }
    });
    let foundSubtotals = [];
    subtotalLines.forEach(line => {
        const matches = line.match(/([\d,]+\.\d{2})/g);
        if (matches) {
            matches.forEach(m => {
                const val = parseFloat(m.replace(/,/g, ''));
                if (!isNaN(val) && val > 0) {
                    foundSubtotals.push(val);
                }
            });
        }
    });
    if (foundSubtotals.length > 0) {
        if (amount) {
            const validSubs = foundSubtotals.filter(v => v <= amount);
            if (validSubs.length > 0) {
                subtotal = Math.max(...validSubs);
            } else {
                subtotal = Math.min(...foundSubtotals);
            }
        } else {
            subtotal = Math.min(...foundSubtotals);
        }
    }

    return { amount, subtotal, date, dateStr };
}

// --- MATCHING ALGORITHM ---

function checkBusinessNameMatch(txDescription, invoice) {
    if (!txDescription || !invoice) return false;
    const textLower = (invoice.text || "").toLowerCase();
    const nameLower = (invoice.name || "").toLowerCase();
    const descLower = txDescription.toLowerCase();
    
    // Known merchant alias mapping in Nicaragua
    const aliases = [
        { keys: ['romo', 'roberto morales', 'morales cuadra', 'ferreteria romo'], match: ['romo', 'roberto morales', 'morales cuadra', 'ferreteria romo', 'ferreteria roberto morales'] },
        { keys: ['sinsa', 'servicios industriales'], match: ['sinsa', 'servicios industriales'] },
        { keys: ['pricesmart', 'pricemart', 'price mart'], match: ['pricesmart', 'price mart', 'pricemart'] },
        { keys: ['walmart', 'pali', 'maxi pali', 'union', 'supermercados unidos'], match: ['walmart', 'wal-mart', 'pali', 'maxi pali', 'la union', 'supermercados unidos'] },
        { keys: ['claro', 'enitel'], match: ['claro', 'enitel', 'america movil'] },
        { keys: ['tigo', 'telefonia celular'], match: ['tigo', 'telefonia celular', 'millicom'] },
        { keys: ['puma'], match: ['puma', 'puma energy'] },
        { keys: ['uno'], match: ['estacion uno', 'petronic', 'uno nicaragua'] },
        { keys: ['dilansa'], match: ['dilansa', 'distribuidora agricola'] },
        { keys: ['disagro'], match: ['disagro', 'distribuidora agricola superior'] }
    ];

    for (const item of aliases) {
        if (item.keys.some(k => descLower.includes(k))) {
            if (item.match.some(m => textLower.includes(m) || nameLower.includes(m))) {
                return true;
            }
        }
    }
    
    // Tokenize transaction description into words of length >= 3
    const tokens = descLower.match(/[a-zñáéíóúü]{3,}/g) || [];
    const commonWords = new Set([
        'comercial', 'limitada', 'corporation', 'corporativo', 'services', 'servicio', 'servicios',
        'estacion', 'pago', 'tienda', 'super', 'supermercado', 'express', 'factura', 'recibo',
        'compra', 'ventas', 'venta', 'del', 'las', 'los', 'con', 'por', 'para', 'una', 'uno',
        'nacional', 'internacional', 'nicaragua', 'managua', 'telef', 'telefono', 'celular',
        'asociados', 'grupo', 'centro', 'plaza', 'mall', 'inversiones', 'industrial', 'mons', 'lezc'
    ]);
    
    const keywords = tokens.filter(w => !commonWords.has(w));
    if (keywords.length === 0) return false;
    
    // Check if any keyword matches
    return keywords.some(kw => textLower.includes(kw) || nameLower.includes(kw));
}

function checkAmountMatch(txAmount, txCurrency, invoice, allowCrossCurrency = false) {
    if (!invoice || invoice.extractedAmount === null) return false;
    
    // If not allowing cross-currency, currencies must match
    if (!allowCrossCurrency && invoice.currency !== txCurrency) return false;
    
    const invoiceAmount = invoice.extractedAmount;
    const subtotal = invoice.extractedSubtotal || (invoiceAmount / 1.15);
    
    // Scenario 1: Exact direct match (no retenciones)
    if (Math.abs(invoiceAmount - txAmount) < 0.05) {
        return true;
    }
    
    // Scenario 2: Net of retenciones (NIO only)
    if (txCurrency === 'NIO') {
        const candidates = [];
        candidates.push(invoiceAmount - (subtotal * 0.03)); // both IR and Municipal
        candidates.push(invoiceAmount - (subtotal * 0.02)); // IR only
        candidates.push(invoiceAmount - (subtotal * 0.01)); // Municipal only
        
        // Check if txAmount matches any candidate within 2.0 tolerance
        return candidates.some(cand => Math.abs(cand - txAmount) < 2.0);
    }
    return false;
}

function runMatchingAlgorithm() {
    // Reset matches and retenciones on transactions, preserving manual matches
    ReconState.transactions.forEach(tx => {
        if (tx.isManual && tx.invoices && tx.invoices.length > 0) {
            tx.matched = true;
        } else if (tx.isManual && tx.isReimbursement) {
            tx.matched = true;
        } else {
            tx.matched = false;
            tx.invoices = [];
            tx.isManual = false;
            tx.isReimbursement = false;
            tx.reimbursementDoc = null;
        }
        tx.requiresRetentions = false;
        tx.retentionsValid = true;
        tx.retentionsIRValid = true;
        tx.retentionsMunicipalValid = true;

        // Preserve manually linked retenciones/exemptions
        if (tx.retentionIRDoc && tx.retentionIRDoc.isManual) {
            tx.hasRetencionIR = true;
        } else {
            tx.hasRetencionIR = false;
            tx.retentionIRDoc = null;
        }

        if (tx.retentionMunicipalDoc && tx.retentionMunicipalDoc.isManual) {
            tx.hasRetencionMunicipal = true;
        } else {
            tx.hasRetencionMunicipal = false;
            tx.retentionMunicipalDoc = null;
        }

        if (tx.exemptionDGIDoc && tx.exemptionDGIDoc.isManual) {
            tx.hasExemptionDGI = true;
        } else {
            tx.hasExemptionDGI = false;
            tx.exemptionDGIDoc = null;
        }

        if (tx.exemptionALMADoc && tx.exemptionALMADoc.isManual) {
            tx.hasExemptionALMA = true;
        } else {
            tx.hasExemptionALMA = false;
            tx.exemptionALMADoc = null;
        }

        if (tx.exemptionDoc && tx.exemptionDoc.isManual) {
            tx.isExempt = true;
        } else {
            tx.isExempt = false;
            tx.exemptionDoc = null;
        }
    });

    // Reset matches on documents, preserving manual ones
    ReconState.invoices.forEach(doc => {
        const isLinkedToManual = ReconState.transactions.some(t => t.isManual && t.invoices && t.invoices.includes(doc));
        const isLinkedToRetention = ReconState.transactions.some(t => t.retentionIRDoc === doc || t.retentionMunicipalDoc === doc || t.exemptionDoc === doc);
        const isLinkedToReimbursement = ReconState.transactions.some(t => t.isManual && t.reimbursementDoc === doc);
        
        if (doc.isManual && (isLinkedToManual || isLinkedToRetention || isLinkedToReimbursement)) {
            doc.matched = true;
        } else {
            doc.matched = false;
            doc.isManual = false;
        }
    });

    const maxDaysDiff = window.AppState.settings.toleranceDays;

    // --- PASS 1: Same currency + Business Name + Amount match + Date tolerance ---
    ReconState.transactions.forEach(tx => {
        if (tx.type !== 'charge' || tx.matched) return;
        
        const eligibleInvoices = ReconState.invoices.filter(doc => 
            !doc.matched && 
            doc.docType === 'invoice' &&
            checkAmountMatch(tx.amount, tx.currency, doc, false) &&
            checkBusinessNameMatch(tx.description, doc)
        );

        if (eligibleInvoices.length > 0) {
            let bestInvoice = null;
            let minDiff = Infinity;

            eligibleInvoices.forEach(inv => {
                if (tx.date && inv.extractedDate) {
                    const diffTime = Math.abs(tx.date - inv.extractedDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays < minDiff) {
                        minDiff = diffDays;
                        bestInvoice = inv;
                    }
                } else {
                    if (bestInvoice === null) {
                        bestInvoice = inv;
                    }
                }
            });

            if (bestInvoice) {
                if (minDiff <= maxDaysDiff || minDiff === Infinity) {
                    tx.matched = true;
                    tx.invoices = [bestInvoice];
                    bestInvoice.matched = true;
                }
            }
        }
    });

    // --- PASS 2: Cross currency + Business Name + Amount match + Date tolerance ---
    ReconState.transactions.forEach(tx => {
        if (tx.type !== 'charge' || tx.matched) return;
        
        const eligibleInvoices = ReconState.invoices.filter(doc => 
            !doc.matched && 
            doc.docType === 'invoice' &&
            checkAmountMatch(tx.amount, tx.currency, doc, true) &&
            checkBusinessNameMatch(tx.description, doc)
        );

        if (eligibleInvoices.length > 0) {
            let bestInvoice = null;
            let minDiff = Infinity;

            eligibleInvoices.forEach(inv => {
                if (tx.date && inv.extractedDate) {
                    const diffTime = Math.abs(tx.date - inv.extractedDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays < minDiff) {
                        minDiff = diffDays;
                        bestInvoice = inv;
                    }
                } else {
                    if (bestInvoice === null) {
                        bestInvoice = inv;
                    }
                }
            });

            if (bestInvoice) {
                if (minDiff <= maxDaysDiff || minDiff === Infinity) {
                    tx.matched = true;
                    tx.invoices = [bestInvoice];
                    bestInvoice.matched = true;
                    bestInvoice.currency = tx.currency; // Sync currency!
                }
            }
        }
    });

    // --- PASS 3: Same currency + Amount match + Date tolerance (No business name match) ---
    ReconState.transactions.forEach(tx => {
        if (tx.type !== 'charge' || tx.matched) return;
        
        const eligibleInvoices = ReconState.invoices.filter(doc => 
            !doc.matched && 
            doc.docType === 'invoice' &&
            checkAmountMatch(tx.amount, tx.currency, doc, false)
        );

        if (eligibleInvoices.length > 0) {
            let bestInvoice = null;
            let minDiff = Infinity;

            eligibleInvoices.forEach(inv => {
                if (tx.date && inv.extractedDate) {
                    const diffTime = Math.abs(tx.date - inv.extractedDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays < minDiff) {
                        minDiff = diffDays;
                        bestInvoice = inv;
                    }
                } else {
                    if (bestInvoice === null) {
                        bestInvoice = inv;
                    }
                }
            });

            if (bestInvoice) {
                if (minDiff <= maxDaysDiff || minDiff === Infinity) {
                    tx.matched = true;
                    tx.invoices = [bestInvoice];
                    bestInvoice.matched = true;
                }
            }
        }
    });

    // --- PASS 4: Cross currency + Amount match + Date tolerance (No business name match) ---
    ReconState.transactions.forEach(tx => {
        if (tx.type !== 'charge' || tx.matched) return;
        
        const eligibleInvoices = ReconState.invoices.filter(doc => 
            !doc.matched && 
            doc.docType === 'invoice' &&
            checkAmountMatch(tx.amount, tx.currency, doc, true)
        );

        if (eligibleInvoices.length > 0) {
            let bestInvoice = null;
            let minDiff = Infinity;

            eligibleInvoices.forEach(inv => {
                if (tx.date && inv.extractedDate) {
                    const diffTime = Math.abs(tx.date - inv.extractedDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays < minDiff) {
                        minDiff = diffDays;
                        bestInvoice = inv;
                    }
                } else {
                    if (bestInvoice === null) {
                        bestInvoice = inv;
                    }
                }
            });

            if (bestInvoice) {
                if (minDiff <= maxDaysDiff || minDiff === Infinity) {
                    tx.matched = true;
                    tx.invoices = [bestInvoice];
                    bestInvoice.matched = true;
                    bestInvoice.currency = tx.currency; // Sync currency!
                }
            }
        }
    });

    // 2. RETENTIONS MATCHING & TAX AUDITING
    ReconState.transactions.forEach(tx => {
        if (!tx.matched || !tx.invoices || tx.invoices.length === 0) return;

        const thresholdNIO = 1000;
        const thresholdUSD = 27.30;

        tx.requiresRetentions = false;
        tx.retentionsValid = true;
        tx.retentionsIRValid = true;
        tx.retentionsMunicipalValid = true;

        // Preserve manually linked retenciones/exemptions
        if (tx.retentionIRDoc && tx.retentionIRDoc.isManual) {
            tx.hasRetencionIR = true;
        } else {
            tx.hasRetencionIR = false;
            tx.retentionIRDoc = null;
        }

        if (tx.retentionMunicipalDoc && tx.retentionMunicipalDoc.isManual) {
            tx.hasRetencionMunicipal = true;
        } else {
            tx.hasRetencionMunicipal = false;
            tx.retentionMunicipalDoc = null;
        }

        if (tx.exemptionDoc && tx.exemptionDoc.isManual) {
            tx.isExempt = true;
        } else {
            tx.isExempt = false;
            tx.exemptionDoc = null;
        }

        // Check if this is a fuel station transaction (PUMA / UNO) — no retentions required
        const isFuelStation = /\bPUMA\b|\bUNO\b/i.test(tx.description);
        if (isFuelStation) {
            tx.requiresRetentions = false;
            tx.retentionsValid = true;
            return;
        }

        const invoicesRequiringRet = (tx.currency === 'USD') ? [] : tx.invoices.filter(inv => {
            const baseAmount = tx.amount / (tx.invoices.length || 1);
            const estSubtotal = baseAmount / 1.15;
            return (tx.currency === 'NIO' && estSubtotal > thresholdNIO);
        });

        if (invoicesRequiringRet.length > 0) {
            tx.requiresRetentions = true;

            invoicesRequiringRet.forEach(inv => {
                const baseAmount = tx.amount / (tx.invoices.length || 1);
                const estSubtotal = baseAmount / 1.15;
                const invoiceRef = inv.invoiceRef;
                const expectedIRRate = 0.02;
                const expectedMunicipalRate = 0.01;

                // 1. Check IR / DGI requirement (IR Retention 2% or DGI Exemption)
                if (tx.exemptionDGIDoc) {
                    tx.exemptionDGIDoc.matched = true;
                    tx.retentionsIRValid = true;
                } else if (tx.hasRetencionIR && tx.retentionIRDoc) {
                    tx.retentionIRDoc.matched = true;
                    tx.retentionsIRValid = true;
                } else {
                    // Try auto-match IR doc
                    const foundIR = ReconState.invoices.find(doc => {
                        if (doc.matched || (doc.docType !== 'retencion_ir' && doc.docType !== 'exencion_dgi' && doc.docType !== 'exencion')) return false;
                        const matchesInvoiceRef = invoiceRef && doc.invoiceRef && (invoiceRef === doc.invoiceRef);
                        const matchesBase = doc.baseAmount && (Math.abs(doc.baseAmount - estSubtotal) < 15.0);
                        const matchesWithheld = doc.withheldAmount && (Math.abs(doc.withheldAmount - (expectedIRRate * estSubtotal)) < 5.0);
                        return matchesInvoiceRef || matchesBase || matchesWithheld;
                    });

                    if (foundIR) {
                        foundIR.matched = true;
                        if (foundIR.docType === 'exencion_dgi' || foundIR.docType === 'exencion') {
                            tx.exemptionDGIDoc = foundIR;
                            tx.hasExemptionDGI = true;
                        } else {
                            tx.hasRetencionIR = true;
                            tx.retentionIRDoc = foundIR;
                        }
                        tx.retentionsIRValid = true;
                    } else {
                        tx.retentionsIRValid = false;
                    }
                }

                // 2. Check ALMA / Municipal requirement (Municipal Retention 1% or ALMA Exemption)
                if (tx.currency === 'NIO') {
                    if (tx.exemptionALMADoc) {
                        tx.exemptionALMADoc.matched = true;
                        tx.retentionsMunicipalValid = true;
                    } else if (tx.hasRetencionMunicipal && tx.retentionMunicipalDoc) {
                        tx.retentionMunicipalDoc.matched = true;
                        tx.retentionsMunicipalValid = true;
                    } else {
                        // Try auto-match Municipal doc
                        const foundMunicipal = ReconState.invoices.find(doc => {
                            if (doc.matched || (doc.docType !== 'retencion_municipal' && doc.docType !== 'exencion_alma' && doc.docType !== 'exencion')) return false;
                            const matchesInvoiceRef = invoiceRef && doc.invoiceRef && (invoiceRef === doc.invoiceRef);
                            const matchesBase = doc.baseAmount && (Math.abs(doc.baseAmount - estSubtotal) < 15.0);
                            const matchesWithheld = doc.withheldAmount && (Math.abs(doc.withheldAmount - (expectedMunicipalRate * estSubtotal)) < 3.0);
                            return matchesInvoiceRef || matchesBase || matchesWithheld;
                        });

                        if (foundMunicipal) {
                            foundMunicipal.matched = true;
                            if (foundMunicipal.docType === 'exencion_alma' || foundMunicipal.docType === 'exencion') {
                                tx.exemptionALMADoc = foundMunicipal;
                                tx.hasExemptionALMA = true;
                            } else {
                                tx.hasRetencionMunicipal = true;
                                tx.retentionMunicipalDoc = foundMunicipal;
                            }
                            tx.retentionsMunicipalValid = true;
                        } else {
                            tx.retentionsMunicipalValid = false;
                        }
                    }
                } else {
                    tx.retentionsMunicipalValid = true;
                }
            });

            tx.retentionsValid = !!(tx.retentionsIRValid && tx.retentionsMunicipalValid);
        } else {
            tx.requiresRetentions = false;
            tx.retentionsValid = true;
        }
    });

    // Fallback date: Any matched invoice with missing date inherits the transaction date
    ReconState.transactions.forEach(tx => {
        if (tx.matched && tx.invoices) {
            tx.invoices.forEach(inv => {
                if (!inv.extractedDateStr || inv.extractedDateStr === 'No identificada') {
                    inv.extractedDateStr = tx.dateStr;
                    inv.extractedDate = tx.date;
                }
            });
        }
    });
}

// --- UI UPDATING & RENDERING ---

function updateProgress(percent, statusText) {
    reconElements.progressFill.style.width = `${percent}%`;
    reconElements.progressStatus.textContent = statusText;
    reconElements.progressPercent.textContent = `${percent}%`;
}

function addLog(text, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    reconElements.logsContainer.appendChild(entry);
    reconElements.logsContainer.scrollTop = reconElements.logsContainer.scrollHeight;
}

function getRetentionsBadgeHTML(tx) {
    if (tx.isReimbursement) {
        return `<span class="badge" style="background-color: rgba(245, 158, 11, 0.1); color: var(--color-warning); border: 1px solid var(--color-warning);"><i data-lucide="user-x"></i>Cargo a Empleado</span>`;
    }
    
    let html = `<div style="display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start;">`;
    
    // Add Purchase Order check for non-fuel charges
    const isFuel = /\bPUMA\b|\bUNO\b/i.test(tx.description);
    if (!isFuel && tx.type === 'charge') {
        if (tx.purchaseOrderDoc) {
            const poNo = tx.purchaseOrderDoc.purchaseOrderRef || tx.purchaseOrderDoc.name.substring(0, 15);
            html += `<span class="badge badge-success" title="OC vinculada: ${tx.purchaseOrderDoc.name}"><i data-lucide="file-text"></i>OC: ${poNo}</span>`;
        } else {
            html += `<span class="badge badge-danger"><i data-lucide="alert-triangle"></i>Falta OC</span>`;
        }
    }

    if (!tx.requiresRetentions) {
        if (isFuel) {
            html += `<span class="badge" style="background-color: rgba(148, 163, 184, 0.1); color: var(--text-muted);"><i data-lucide="minus"></i>No Requiere Ret.</span>`;
        }
    } else {
        if (tx.isExempt) {
            html += `<span class="badge badge-success"><i data-lucide="shield-check"></i>Exento (OK)</span>`;
        } else {
            if (tx.hasRetencionIR && tx.retentionsIRValid) {
                html += `<span class="badge badge-success"><i data-lucide="check"></i>IR 2% OK</span>`;
            } else {
                html += `<span class="badge badge-danger"><i data-lucide="alert-triangle"></i>Falta IR 2%</span>`;
            }
            
            if (tx.hasRetencionMunicipal && tx.retentionsMunicipalValid) {
                html += `<span class="badge badge-success"><i data-lucide="check"></i>ALMA 1% OK</span>`;
            } else {
                html += `<span class="badge badge-danger"><i data-lucide="alert-triangle"></i>Falta ALMA 1%</span>`;
            }
        }
    }
    
    html += `</div>`;
    return html;
}

function renderReconciliationUI() {
    reconElements.statsSection.classList.remove('hidden');
    reconElements.resultsSection.classList.remove('hidden');
    
    if (reconElements.btnClearRecon) {
        if (ReconState.transactions.length > 0) {
            reconElements.btnClearRecon.classList.remove('hidden');
        } else {
            reconElements.btnClearRecon.classList.add('hidden');
        }
    }

    const totalTx = ReconState.transactions.filter(t => t.type === 'charge').length;
    const reimbursementTx = ReconState.transactions.filter(t => t.isReimbursement && t.type === 'charge');
    const matchedTx = ReconState.transactions.filter(t => t.matched && !t.isReimbursement && t.type === 'charge').length;
    const missingTx = ReconState.transactions.filter(t => !t.matched && t.type === 'charge').length;
    const orphanInvoices = ReconState.invoices.filter(i => !i.matched && (i.docType === 'invoice' || !i.docType)).length;

    // Sum reimbursement amounts by currency
    const reimbursementsNIO = reimbursementTx.filter(t => t.currency === 'NIO').reduce((acc, t) => acc + t.amount, 0);
    const reimbursementsUSD = reimbursementTx.filter(t => t.currency === 'USD').reduce((acc, t) => acc + t.amount, 0);

    const reimbursementsVal = document.getElementById('stat-reimbursements');
    if (reimbursementsVal) {
        reimbursementsVal.textContent = `${window.formatCurrency(reimbursementsNIO, 'NIO')} / ${window.formatCurrency(reimbursementsUSD, 'USD')}`;
    }

    // Conteo de auditoría de retenciones impositivas
    const matchedRequiringRet = ReconState.transactions.filter(t => t.matched && t.requiresRetentions && !t.isReimbursement && t.type === 'charge');
    const retValidCount = matchedRequiringRet.filter(t => t.retentionsValid).length;
    const retInvalidCount = matchedRequiringRet.filter(t => !t.retentionsValid).length;

    // Update stats counters
    reconElements.statTotalTx.textContent = totalTx;
    reconElements.statMatchedTx.textContent = matchedTx;
    reconElements.statMissingTx.textContent = missingTx;
    reconElements.statOrphanInvoices.textContent = orphanInvoices;

    reconElements.countUnresolved.textContent = missingTx;
    reconElements.countResolved.textContent = ReconState.transactions.filter(t => t.matched && t.type === 'charge').length;
    reconElements.countOrphans.textContent = orphanInvoices;
    reconElements.countAllTx.textContent = ReconState.transactions.length;

    // Update sublabel for tax withholding auditing
    if (reconElements.statRetentionsAudit) {
        if (matchedRequiringRet.length === 0) {
            reconElements.statRetentionsAudit.textContent = "Ninguna requiere retenciones";
        } else {
            reconElements.statRetentionsAudit.textContent = `${retValidCount} correctas | ${retInvalidCount} con alertas`;
        }
    }

    // Show/hide tax alert warning banner
    if (reconElements.taxAlertBanner && reconElements.taxAlertText) {
        if (retInvalidCount > 0) {
            reconElements.taxAlertBanner.classList.remove('hidden');
            reconElements.taxAlertText.textContent = `Se detectaron ${retInvalidCount} facturas conciliadas con montos mayores al límite legal (C$1,000 / $27.30) que no poseen sus comprobantes de retención correspondientes.`;
        } else {
            reconElements.taxAlertBanner.classList.add('hidden');
        }
    }

    // Show/hide perfect matching banner
    if (missingTx === 0 && totalTx > 0) {
        reconElements.successBanner.classList.remove('hidden');
    } else {
        reconElements.successBanner.classList.add('hidden');
    }

    // Populate Tab 1: Unresolved Transactions
    const tbodyUnresolved = document.querySelector('#table-unresolved tbody');
    tbodyUnresolved.innerHTML = '';
    
    // Reset bulk selection UI elements on render
    const checkAllBox = document.getElementById('check-all-unresolved');
    if (checkAllBox) checkAllBox.checked = false;
    const bulkBar = document.getElementById('bulk-actions-unresolved');
    if (bulkBar) bulkBar.classList.add('hidden');

    const unresolvedList = ReconState.transactions.filter(t => !t.matched && t.type === 'charge');
    if (unresolvedList.length === 0) {
        tbodyUnresolved.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 2rem;">No hay transacciones pendientes de respaldo.</td></tr>`;
    } else {
        unresolvedList.forEach(tx => {
            const tr = document.createElement('tr');
            const amtCordobas = tx.currency === 'NIO' ? window.formatCurrency(tx.amount, 'NIO') : '---';
            const amtDolares = tx.currency === 'USD' ? window.formatCurrency(tx.amount, 'USD') : '---';
            tr.innerHTML = `
                <td class="text-center"><input type="checkbox" class="check-tx-unresolved" data-id="${tx.id}"></td>
                <td>${tx.dateStr}</td>
                <td><small class="text-muted" style="font-family: monospace;">${tx.reference || '---'}</small></td>
                <td><strong>${tx.description}</strong></td>
                <td class="text-right font-medium">${amtCordobas}</td>
                <td class="text-right font-medium">${amtDolares}</td>
                <td><span class="badge badge-danger"><i data-lucide="x"></i>Falta Respaldo</span></td>
                <td class="text-center">
                    <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                        <button class="btn btn-secondary btn-sm btn-upload-invoice-action" data-id="${tx.id}">
                            <i data-lucide="upload"></i>Subir Factura
                        </button>
                        <button class="btn btn-warning btn-sm btn-mark-reimbursement-action" data-id="${tx.id}" title="Cargar a empleado por falta de respaldo">
                            <i data-lucide="user-x"></i>Cargar Empleado
                        </button>
                    </div>
                </td>
            `;
            tbodyUnresolved.appendChild(tr);
        });
    }

    // Populate Tab 2: Resolved Transactions
    const tbodyResolved = document.querySelector('#table-resolved tbody');
    tbodyResolved.innerHTML = '';
    
    const resolvedList = ReconState.transactions.filter(t => t.matched && t.type === 'charge');
    if (resolvedList.length === 0) {
        tbodyResolved.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding: 2rem;">Aún no se han conciliado transacciones.</td></tr>`;
    } else {
        resolvedList.forEach(tx => {
            const tr = document.createElement('tr');
            const amtCordobas = tx.currency === 'NIO' ? window.formatCurrency(tx.amount, 'NIO') : '---';
            const amtDolares = tx.currency === 'USD' ? window.formatCurrency(tx.amount, 'USD') : '---';
            
            let invoiceNames = '---';
            let invoiceDates = '---';
            let viewButtonsHTML = '';

            if (tx.isReimbursement) {
                invoiceNames = tx.reimbursementDoc ? `<span class="color-warning" style="font-size: 0.8rem; font-weight: 500;">Reembolso (${tx.reimbursementDoc.name})</span>` : '<span class="color-warning" style="font-size: 0.8rem; font-weight: 500;">Reembolso a Empresa</span>';
                invoiceDates = 'N/A';
                viewButtonsHTML = `
                    <div style="display: flex; gap: 0.25rem; justify-content: center; align-items: center; flex-wrap: wrap;">
                        ${tx.reimbursementDoc ? `
                        <button class="btn btn-secondary btn-sm btn-view-reimbursement-action" data-id="${tx.id}" title="Ver Comprobante de Depósito/Transferencia">
                            <i data-lucide="eye"></i>Ver Depósito
                        </button>` : ''}
                        <button class="btn btn-danger btn-sm btn-remove-reimbursement-action" data-id="${tx.id}" title="Quitar cargo a empleado">
                            <i data-lucide="user-check"></i>Quitar Cargo
                        </button>
                    </div>
                `;
            } else {
                if (tx.invoices && tx.invoices.length > 0) {
                    invoiceNames = tx.invoices.map(inv => {
                        const invNo = inv.invoiceRef ? 
                            `<span style="color:#38bdf8; font-weight:600; font-family:monospace;">(N°. ${inv.invoiceRef})</span>` : 
                            `<button type="button" class="btn-quick-edit-invno" data-id="${tx.id}" data-name="${escapeHtml(inv.name)}" style="font-size:0.65rem; padding:1px 5px; border:1px dashed var(--border-color); background:rgba(255,255,255,0.06); color:var(--text-muted); border-radius:4px; cursor:pointer; display:inline-flex; align-items:center; gap:2px;" title="Haz clic para ingresar o editar el N° de factura"><i data-lucide="edit-2" style="width:10px; height:10px;"></i> Sin N° (Ingresar)</button>`;
                        let rucText = '';
                        if (inv.docType === 'invoice') {
                            if (inv.providerRuc) {
                                rucText = ` <span class="badge badge-success" style="font-size:0.65rem; padding:2px 5px; font-weight:600; font-family:monospace;" title="RUC Proveedor detectado">RUC: ${inv.providerRuc}</span>`;
                            } else {
                                rucText = ` <button type="button" class="badge badge-danger btn-quick-edit-ruc" data-id="${tx.id}" data-name="${escapeHtml(inv.name)}" style="font-size:0.65rem; padding:2px 5px; font-weight:600; cursor:pointer; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:2px;" title="Haz clic para ingresar o editar el RUC del proveedor"><i data-lucide="edit-3" style="width:10px; height:10px;"></i> Sin RUC (Ingresar)</button>`;
                            }
                        }
                        return `<div style="margin-bottom:0.25rem;">${inv.name} <small class="text-muted">${invNo}</small>${rucText}</div>`;
                    }).join('');
                } else if (tx.invoice) {
                    const invNo = tx.invoice.invoiceRef ? 
                        `<span style="color:#38bdf8; font-weight:600; font-family:monospace;">(N°. ${tx.invoice.invoiceRef})</span>` : 
                        `<button type="button" class="btn-quick-edit-invno" data-id="${tx.id}" data-name="${escapeHtml(tx.invoice.name)}" style="font-size:0.65rem; padding:1px 5px; border:1px dashed var(--border-color); background:rgba(255,255,255,0.06); color:var(--text-muted); border-radius:4px; cursor:pointer; display:inline-flex; align-items:center; gap:2px;" title="Haz clic para ingresar o editar el N° de factura"><i data-lucide="edit-2" style="width:10px; height:10px;"></i> Sin N° (Ingresar)</button>`;
                    let rucText = '';
                    if (tx.invoice.docType === 'invoice') {
                        if (tx.invoice.providerRuc) {
                            rucText = ` <span class="badge badge-success" style="font-size:0.65rem; padding:2px 5px; font-weight:600; font-family:monospace;" title="RUC Proveedor detectado">RUC: ${tx.invoice.providerRuc}</span>`;
                        } else {
                            rucText = ` <button type="button" class="badge badge-danger btn-quick-edit-ruc" data-id="${tx.id}" data-name="${escapeHtml(tx.invoice.name)}" style="font-size:0.65rem; padding:2px 5px; font-weight:600; cursor:pointer; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:2px;" title="Haz clic para ingresar o editar el RUC del proveedor"><i data-lucide="edit-3" style="width:10px; height:10px;"></i> Sin RUC (Ingresar)</button>`;
                        }
                    }
                    invoiceNames = `<div>${tx.invoice.name} <small class="text-muted">${invNo}</small>${rucText}</div>`;
                } else {
                    invoiceNames = '---';
                }
                invoiceDates = tx.invoices ? tx.invoices.map(i => i.extractedDateStr || tx.dateStr || 'No ident.').join(', ') : (tx.invoice ? (tx.invoice.extractedDateStr || tx.dateStr || 'No identificada') : 'No identificada');

                let invoiceButtonsHTML = '';
                if (tx.invoices && tx.invoices.length > 0) {
                    invoiceButtonsHTML = tx.invoices.map((inv, idx) => `
                        <button class="btn btn-secondary btn-sm btn-view-invoice-action" data-id="${tx.id}" data-inv-idx="${idx}" title="Ver ${inv.name}" style="margin: 0.1rem;">
                            <i data-lucide="eye"></i>Ver F.${idx + 1}
                        </button>
                    `).join('');
                } else if (tx.invoice) {
                    invoiceButtonsHTML = `
                        <button class="btn btn-secondary btn-sm btn-view-invoice-action" data-id="${tx.id}" data-inv-idx="0" title="Ver Factura">
                            <i data-lucide="eye"></i>Ver Factura
                        </button>
                    `;
                }

                let purchaseOrderButtonsHTML = '';
                const isFuel = /\bPUMA\b|\bUNO\b/i.test(tx.description);
                if (!isFuel && tx.type === 'charge') {
                    if (tx.purchaseOrderDoc) {
                        purchaseOrderButtonsHTML += `
                            <button class="btn btn-success btn-sm btn-view-po-action" data-id="${tx.id}" title="Ver Orden de Compra" style="margin: 0.1rem;">
                                <i data-lucide="file-text"></i>Ver OC
                            </button>
                            <button class="btn btn-danger btn-sm btn-unlink-po-action" data-id="${tx.id}" title="Quitar Orden de Compra" style="margin: 0.1rem; padding: 0.2rem 0.35rem;">
                                <i data-lucide="unlink"></i>
                            </button>
                        `;
                    } else {
                        purchaseOrderButtonsHTML += `
                            <button class="btn btn-warning btn-sm btn-upload-po-action" data-id="${tx.id}" title="Subir Orden de Compra" style="margin: 0.1rem;">
                                <i data-lucide="upload"></i>Subir OC
                            </button>
                        `;
                    }
                }

                let retentionButtonsHTML = '';
                if (tx.requiresRetentions) {
                    // 1. IR / DGI Component
                    if (tx.exemptionDGIDoc) {
                        retentionButtonsHTML += `
                            <button class="btn btn-success btn-sm btn-view-doc-action" data-doc-name="${escapeHtml(tx.exemptionDGIDoc.name)}" data-tx-id="${tx.id}" title="Ver Exoneración DGI" style="margin: 0.1rem;">
                                <i data-lucide="shield-check"></i>Exento DGI
                            </button>
                        `;
                    } else if (tx.hasRetencionIR && tx.retentionIRDoc) {
                        retentionButtonsHTML += `
                            <button class="btn btn-success btn-sm btn-view-retention-ir-action" data-id="${tx.id}" title="Ver Retención IR 2%" style="margin: 0.1rem;">
                                <i data-lucide="eye"></i>Ver IR 2%
                            </button>
                        `;
                    } else {
                        retentionButtonsHTML += `
                            <button class="btn btn-warning btn-sm btn-upload-retention-ir-action" data-id="${tx.id}" title="Subir Retención IR 2%" style="margin: 0.1rem;">
                                <i data-lucide="upload"></i>Subir IR 2%
                            </button>
                            <button class="btn btn-secondary btn-sm btn-upload-exemption-dgi-action" data-id="${tx.id}" title="Subir Exoneración DGI" style="margin: 0.1rem; border: 1px dashed var(--color-primary); color: var(--color-primary); background: transparent;">
                                <i data-lucide="shield"></i>Exoneración DGI
                            </button>
                        `;
                    }

                    // 2. ALMA / Municipal Component (NIO only)
                    if (tx.currency !== 'USD') {
                        if (tx.exemptionALMADoc) {
                            retentionButtonsHTML += `
                                <button class="btn btn-success btn-sm btn-view-doc-action" data-doc-name="${escapeHtml(tx.exemptionALMADoc.name)}" data-tx-id="${tx.id}" title="Ver Exoneración ALMA" style="margin: 0.1rem;">
                                    <i data-lucide="shield-check"></i>Exento ALMA
                                </button>
                            `;
                        } else if (tx.hasRetencionMunicipal && tx.retentionMunicipalDoc) {
                            retentionButtonsHTML += `
                                <button class="btn btn-success btn-sm btn-view-retention-municipal-action" data-id="${tx.id}" title="Ver Retención ALMA 1%" style="margin: 0.1rem;">
                                    <i data-lucide="eye"></i>Ver ALMA 1%
                                </button>
                            `;
                        } else {
                            retentionButtonsHTML += `
                                <button class="btn btn-warning btn-sm btn-upload-retention-municipal-action" data-id="${tx.id}" title="Subir Retención ALMA 1%" style="margin: 0.1rem;">
                                    <i data-lucide="upload"></i>Subir ALMA 1%
                                </button>
                                <button class="btn btn-secondary btn-sm btn-upload-exemption-alma-action" data-id="${tx.id}" title="Subir Exoneración ALMA" style="margin: 0.1rem; border: 1px dashed var(--color-primary); color: var(--color-primary); background: transparent;">
                                    <i data-lucide="shield"></i>Exoneración ALMA
                                </button>
                            `;
                        }
                    }
                }

                viewButtonsHTML = `
                    <div style="display: flex; gap: 0.25rem; justify-content: center; align-items: center; flex-wrap: wrap;">
                        ${invoiceButtonsHTML || '---'}
                        ${purchaseOrderButtonsHTML}
                        ${retentionButtonsHTML}
                    </div>
                `;
            }

            const isFuel = /\bPUMA\b|\bUNO\b/i.test(tx.description);
            let descContent = `<strong>${tx.description}</strong>`;
            if (isFuel) {
                descContent += `
                    <div style="margin-top: 0.25rem; display: flex; align-items: center; gap: 0.35rem;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 500;">Placa:</span>
                        <input type="text" class="input-plate-number" data-id="${tx.id}" placeholder="Ej: M 1234" value="${tx.vehiclePlate || ''}" style="width: 85px; height: 20px; font-size: 0.7rem; padding: 0.1rem 0.25rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-main);">
                    </div>
                `;
            }

            tr.innerHTML = `
                <td>${tx.dateStr}</td>
                <td><small class="text-muted" style="font-family: monospace;">${tx.reference || '---'}</small></td>
                <td>${descContent}</td>
                <td class="text-right font-medium color-success">${amtCordobas}</td>
                <td class="text-right font-medium color-success">${amtDolares}</td>
                <td style="font-size: 0.8rem; min-width: 180px;">${invoiceNames}</td>
                <td style="font-size: 0.8rem;">${invoiceDates}</td>
                <td>${getRetentionsBadgeHTML(tx)}</td>
                <td class="text-center" style="white-space: nowrap;">
                    ${viewButtonsHTML}
                </td>
            `;
            tbodyResolved.appendChild(tr);
        });
    }

    // Populate Tab 3: Orphan Invoices
    const tbodyOrphans = document.querySelector('#table-orphans tbody');
    tbodyOrphans.innerHTML = '';
    
    // Filter to actual unassigned invoice documents
    const orphansList = ReconState.invoices.filter(i => !i.matched && (i.docType === 'invoice' || !i.docType));
    if (orphansList.length === 0) {
        tbodyOrphans.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">No hay facturas sueltas o sin relación.</td></tr>`;
    } else {
        orphansList.forEach((inv, idx) => {
            const tr = document.createElement('tr');
            
            let nameDisplay = inv.name;
            if (inv.lowQuality) {
                nameDisplay = `
                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <span>${inv.name}</span>
                        <span class="badge badge-danger" style="font-size: 0.65rem; width: fit-content;" title="Confianza OCR: ${inv.confidence}%">
                            <i data-lucide="alert-triangle"></i>Baja Legibilidad / Re-subir
                        </span>
                    </div>
                `;
            }

            const orphanCurrency = inv.currency || 'NIO';

            tr.innerHTML = `
                <td>${nameDisplay}</td>
                <td>${inv.extractedDateStr || 'No identificada'}</td>
                <td class="text-right font-medium">${inv.extractedAmount ? window.formatCurrency(inv.extractedAmount, orphanCurrency) : 'N/A'}</td>
                <td class="text-muted" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${escapeHtml((inv.text || '').substring(0, 100))}...
                </td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-sm btn-view-orphan-action" data-orphan-idx="${idx}" data-name="${escapeHtml(inv.name)}">
                        <i data-lucide="eye"></i>Inspeccionar
                    </button>
                </td>
            `;
            tbodyOrphans.appendChild(tr);
        });
    }

    // Populate Tab 5: Comprobantes de Retención
    const tbodyRetentions = document.querySelector('#table-retentions tbody');
    if (tbodyRetentions) {
        tbodyRetentions.innerHTML = '';
        
        const retventionsList = ReconState.invoices.filter(i => i.docType === 'retencion_ir' || i.docType === 'retencion_municipal' || i.docType === 'exencion' || i.docType === 'orden_compra');
        
        // Update header count
        const countRetentions = document.getElementById('count-retentions');
        if (countRetentions) {
            countRetentions.textContent = retventionsList.length;
        }

        if (retventionsList.length === 0) {
            tbodyRetentions.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No hay comprobantes de retención, exenciones u órdenes de compra cargados.</td></tr>`;
        } else {
            retventionsList.forEach((doc, idx) => {
                const tr = document.createElement('tr');
                
                let docTypeStr = "Exención";
                if (doc.docType === 'retencion_ir') docTypeStr = "Retención IR 2%";
                else if (doc.docType === 'retencion_municipal') docTypeStr = "Retención Municipal 1%";
                else if (doc.docType === 'orden_compra') docTypeStr = "Orden de Compra";

                let baseAmt = doc.baseAmount ? window.formatCurrency(doc.baseAmount, doc.currency || 'NIO') : '---';
                let withheldAmt = doc.withheldAmount ? window.formatCurrency(doc.withheldAmount, doc.currency || 'NIO') : '---';
                
                const associatedTx = ReconState.transactions.find(t => 
                    t.retentionIRDoc === doc || 
                    t.retentionMunicipalDoc === doc || 
                    t.exemptionDoc === doc ||
                    t.purchaseOrderDoc === doc
                );
                
                let relationStr = "";
                if (associatedTx) {
                    const formattedAmt = associatedTx.currency === 'NIO' ? window.formatCurrency(associatedTx.amount, 'NIO') : window.formatCurrency(associatedTx.amount, 'USD');
                    relationStr = `<span class="color-success" style="font-size:0.8rem; font-weight:500;">
                        <i data-lucide="link"></i> ${associatedTx.dateStr} | ${associatedTx.description.substring(0, 20)} (${formattedAmt})
                    </span>`;
                } else {
                    relationStr = `<span class="badge badge-warning"><i data-lucide="link-2"></i>Sin Vincular</span>`;
                }

                let nameDisplay = doc.name;
                if (doc.lowQuality) {
                    nameDisplay = `
                        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                            <span>${doc.name}</span>
                            <span class="badge badge-danger" style="font-size: 0.65rem; width: fit-content;" title="Confianza OCR: ${doc.confidence}%">
                                <i data-lucide="alert-triangle"></i>Baja Legibilidad / Re-subir
                            </span>
                        </div>
                    `;
                }

                tr.innerHTML = `
                    <td>${nameDisplay}</td>
                    <td><span class="badge badge-info">${docTypeStr}</span></td>
                    <td class="text-right">${baseAmt}</td>
                    <td class="text-right font-medium">${withheldAmt}</td>
                    <td>${relationStr}</td>
                    <td class="text-center">
                        <button class="btn btn-secondary btn-sm btn-view-retention-action" data-idx="${idx}">
                            <i data-lucide="eye"></i>Inspeccionar
                        </button>
                    </td>
                `;
                tbodyRetentions.appendChild(tr);
            });

            document.querySelectorAll('.btn-view-retention-action').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.dataset.idx, 10);
                    const retList = ReconState.invoices.filter(i => i.docType === 'retencion_ir' || i.docType === 'retencion_municipal' || i.docType === 'exencion');
                    const doc = retList[idx];
                    if (doc) {
                        const associatedTx = ReconState.transactions.find(t => 
                            t.retentionIRDoc === doc || 
                            t.retentionMunicipalDoc === doc || 
                            t.exemptionDoc === doc
                        );
                        openViewInvoiceModal(doc, associatedTx);
                    }
                });
            });
        }
    }

    // Populate Tab 4: All Statement Transactions
    const tbodyAllTx = document.querySelector('#table-all-tx tbody');
    tbodyAllTx.innerHTML = '';
    
    if (ReconState.transactions.length === 0) {
        tbodyAllTx.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 2rem;">No hay transacciones registradas.</td></tr>`;
    } else {
        ReconState.transactions.forEach(tx => {
            const tr = document.createElement('tr');
            const amtCordobas = tx.currency === 'NIO' ? window.formatCurrency(tx.amount, 'NIO') : '---';
            const amtDolares = tx.currency === 'USD' ? window.formatCurrency(tx.amount, 'USD') : '---';
            tr.innerHTML = `
                <td>${tx.dateStr}</td>
                <td><small class="text-muted" style="font-family: monospace;">${tx.reference || '---'}</small></td>
                <td><strong>${tx.description}</strong></td>
                <td class="text-right font-medium">${amtCordobas}</td>
                <td class="text-right font-medium">${amtDolares}</td>
                <td class="text-center">
                    ${tx.type === 'credit' ? `
                        <span class="badge" style="background-color: rgba(148, 163, 184, 0.15); color: var(--text-muted);">
                            <i data-lucide="minus"></i>Abono/Crédito
                        </span>
                    ` : `
                        <span class="badge ${tx.matched ? 'badge-success' : 'badge-danger'}">
                            <i data-lucide="${tx.matched ? 'check' : 'x'}"></i>${tx.matched ? 'Conciliada' : 'Faltante'}
                        </span>
                    `}
                </td>
                <td class="text-center" style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn btn-secondary btn-sm btn-edit-tx-action" data-id="${tx.id}" title="Editar">
                        <i data-lucide="edit"></i>
                    </button>
                    <button class="btn btn-secondary btn-sm btn-delete-tx-action" data-id="${tx.id}" style="color: var(--color-danger);" title="Eliminar">
                        <i data-lucide="trash"></i>
                    </button>
                </td>
            `;
            tbodyAllTx.appendChild(tr);
        });
    }

    // Bind dynamic actions
    bindTableActionButtons();
    if (window.lucide) window.lucide.createIcons();
}

function bindTableActionButtons() {
    // 1. Upload missing invoice action
    document.querySelectorAll('.btn-upload-invoice-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                openUploadModalForTx(tx);
            }
        });
    });

    // 1b. Mark as reimbursement (charge to employee) action
    document.querySelectorAll('.btn-mark-reimbursement-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                openUploadModalForTx(tx, true);
            }
        });
    });

    // 1c. Remove reimbursement action
    document.querySelectorAll('.btn-remove-reimbursement-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                if (confirm('¿Está seguro de que desea remover el cargo a empleado y el comprobante de reembolso asociado?')) {
                    tx.isReimbursement = false;
                    tx.matched = false;
                    tx.isManual = true;
                    if (tx.reimbursementDoc) {
                        const doc = tx.reimbursementDoc;
                        tx.reimbursementDoc = null;
                        
                        // Check if any other transaction is still using this reimbursement doc
                        const isDocUsed = ReconState.transactions.some(t => t.reimbursementDoc === doc);
                        if (!isDocUsed) {
                            doc.matched = false;
                            doc.isManual = false;
                            const docIdx = ReconState.invoices.findIndex(i => i.name === doc.name);
                            if (docIdx !== -1) {
                                ReconState.invoices.splice(docIdx, 1);
                            }
                        }
                    }
                    window.showToast('Cargo a empleado removido', 'info');
                    runMatchingAlgorithm();
                    renderReconciliationUI();
                }
            }
        });
    });

    // 2. View matched invoice action
    document.querySelectorAll('.btn-view-invoice-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                const invIdx = parseInt(e.currentTarget.dataset.invIdx, 10) || 0;
                const invoice = (tx.invoices && tx.invoices[invIdx]) || tx.invoice;
                if (invoice) {
                    openViewInvoiceModal(invoice, tx);
                }
            }
        });
    });

    // 2b. View reimbursement receipt action
    document.querySelectorAll('.btn-view-reimbursement-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx && tx.reimbursementDoc) {
                openViewInvoiceModal(tx.reimbursementDoc, tx);
            }
        });
    });

    // 2c. Direct Retention / Exemption Actions
    document.querySelectorAll('.btn-upload-retention-ir-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                openUploadModalForTx(tx, false, true, 'retencion_ir');
            }
        });
    });

    document.querySelectorAll('.btn-upload-retention-municipal-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                openUploadModalForTx(tx, false, true, 'retencion_municipal');
            }
        });
    });

    document.querySelectorAll('.btn-upload-exemption-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                openUploadModalForTx(tx, false, true, 'exencion');
            }
        });
    });

    document.querySelectorAll('.btn-upload-exemption-dgi-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                openUploadModalForTx(tx, false, true, 'exencion_dgi');
            }
        });
    });

    document.querySelectorAll('.btn-upload-exemption-alma-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                openUploadModalForTx(tx, false, true, 'exencion_alma');
            }
        });
    });

    document.querySelectorAll('.btn-view-doc-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const docName = e.currentTarget.dataset.docName;
            const txId = e.currentTarget.dataset.txId;
            const tx = ReconState.transactions.find(t => t.id === txId);
            const doc = ReconState.invoices.find(i => i.name === docName);
            if (doc) {
                openViewInvoiceModal(doc, tx);
            }
        });
    });

    document.querySelectorAll('.btn-view-retention-ir-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx && tx.retentionIRDoc) {
                openViewInvoiceModal(tx.retentionIRDoc, tx);
            }
        });
    });

    document.querySelectorAll('.btn-view-retention-municipal-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx && tx.retentionMunicipalDoc) {
                openViewInvoiceModal(tx.retentionMunicipalDoc, tx);
            }
        });
    });

    document.querySelectorAll('.btn-view-exemption-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx && tx.exemptionDoc) {
                openViewInvoiceModal(tx.exemptionDoc, tx);
            }
        });
    });

    // Purchase Order Actions
    document.querySelectorAll('.btn-upload-po-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                openUploadModalForTx(tx, false, false, null, true);
            }
        });
    });

    document.querySelectorAll('.btn-view-po-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx && tx.purchaseOrderDoc) {
                openViewInvoiceModal(tx.purchaseOrderDoc, tx);
            }
        });
    });

    document.querySelectorAll('.btn-unlink-po-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx && tx.purchaseOrderDoc) {
                if (confirm('¿Está seguro de que desea desvincular la Orden de Compra de esta transacción?')) {
                    tx.purchaseOrderDoc.matched = false;
                    tx.purchaseOrderDoc = null;
                    window.showToast('Orden de Compra desvinculada', 'info');
                    renderReconciliationUI();
                }
            }
        });
    });

    // 3. View orphan invoice details
    document.querySelectorAll('.btn-view-orphan-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnEl = e.currentTarget;
            const oIdx = parseInt(btnEl.dataset.orphanIdx, 10);
            const orphansList = ReconState.invoices.filter(i => !i.matched);
            let inv = (!isNaN(oIdx) && orphansList[oIdx]) ? orphansList[oIdx] : null;
            if (!inv && btnEl.dataset.name) {
                inv = ReconState.invoices.find(i => i.name === btnEl.dataset.name);
            }
            if (inv) {
                openViewInvoiceModal(inv);
            }
        });
    });

    // Quick edit RUC button from table
    document.querySelectorAll('.btn-quick-edit-ruc').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = e.currentTarget.dataset.name;
            const txId = e.currentTarget.dataset.id;
            const inv = ReconState.invoices.find(i => i.name === name);
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (inv) {
                openViewInvoiceModal(inv, tx);
                setTimeout(() => {
                    const rucInput = document.getElementById('input-view-invoice-ruc');
                    if (rucInput) {
                        rucInput.focus();
                        rucInput.select();
                    }
                }, 200);
            }
        });
    });

    // Quick edit Invoice Number button from table
    document.querySelectorAll('.btn-quick-edit-invno').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = e.currentTarget.dataset.name;
            const txId = e.currentTarget.dataset.id;
            const inv = ReconState.invoices.find(i => i.name === name);
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (inv) {
                openViewInvoiceModal(inv, tx);
                setTimeout(() => {
                    const invNoInput = document.getElementById('input-view-invoice-number');
                    if (invNoInput) {
                        invNoInput.focus();
                        invNoInput.select();
                    }
                }, 200);
            }
        });
    });

    // 4. Edit statement transaction
    document.querySelectorAll('.btn-edit-tx-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                openTxModal(tx);
            }
        });
    });

    // 5. Delete statement transaction
    document.querySelectorAll('.btn-delete-tx-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.id;
            const idx = ReconState.transactions.findIndex(t => t.id === txId);
            if (idx !== -1) {
                const tx = ReconState.transactions[idx];
                // Revoke connection if matched
                if (tx.matched) {
                    if (tx.invoices) {
                        tx.invoices.forEach(inv => { inv.matched = false; });
                    } else if (tx.invoice) {
                        tx.invoice.matched = false;
                    }
                }
                ReconState.transactions.splice(idx, 1);
                
                // Recalculate matches
                runMatchingAlgorithm();
                renderReconciliationUI();
                window.showToast('Transacción eliminada del estado de cuenta', 'info');
            }
        });
    });

    // Helper function to update bulk selection status
    function updateBulkSelectionUI() {
        const checkedBoxes = document.querySelectorAll('.check-tx-unresolved:checked');
        const count = checkedBoxes.length;
        const bulkBar = document.getElementById('bulk-actions-unresolved');
        const countSelectedSpan = document.getElementById('count-selected-tx');
        const sumSelectedSpan = document.getElementById('sum-selected-tx');
        
        if (count > 0) {
            if (bulkBar) bulkBar.classList.remove('hidden');
            if (countSelectedSpan) countSelectedSpan.textContent = count;
            
            // Sum amounts by currency
            let sumNIO = 0;
            let sumUSD = 0;
            checkedBoxes.forEach(cb => {
                const txId = cb.dataset.id;
                const tx = ReconState.transactions.find(t => t.id === txId);
                if (tx) {
                    if (tx.currency === 'USD') {
                        sumUSD += tx.amount;
                    } else {
                        sumNIO += tx.amount;
                    }
                }
            });
            
            if (sumSelectedSpan) {
                sumSelectedSpan.textContent = `Total: ${window.formatCurrency(sumNIO, 'NIO')} / ${window.formatCurrency(sumUSD, 'USD')}`;
            }
        } else {
            if (bulkBar) bulkBar.classList.add('hidden');
        }
    }

    // Check all checkbox
    const checkAllBox = document.getElementById('check-all-unresolved');
    if (checkAllBox) {
        checkAllBox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.check-tx-unresolved').forEach(cb => {
                cb.checked = isChecked;
            });
            updateBulkSelectionUI();
        });
    }

    // Individual checkboxes change event
    document.querySelectorAll('.check-tx-unresolved').forEach(cb => {
        cb.addEventListener('change', () => {
            // Update check-all box state
            const totalCount = document.querySelectorAll('.check-tx-unresolved').length;
            const checkedCount = document.querySelectorAll('.check-tx-unresolved:checked').length;
            if (checkAllBox) {
                checkAllBox.checked = totalCount === checkedCount && totalCount > 0;
            }
            updateBulkSelectionUI();
        });
    });

    // Bulk Reimbursement Button click
    const btnBulkReimbursement = document.getElementById('btn-bulk-reimbursement');
    if (btnBulkReimbursement) {
        btnBulkReimbursement.addEventListener('click', () => {
            const checkedBoxes = document.querySelectorAll('.check-tx-unresolved:checked');
            const selectedTxs = [];
            checkedBoxes.forEach(cb => {
                const txId = cb.dataset.id;
                const tx = ReconState.transactions.find(t => t.id === txId);
                if (tx) selectedTxs.push(tx);
            });
            
            if (selectedTxs.length > 0) {
                openUploadModalForTx(selectedTxs, true);
            }
        });
    }

    // Bind plate number changes for fuel station transactions
    document.querySelectorAll('.input-plate-number').forEach(input => {
        input.addEventListener('change', (e) => {
            const txId = e.target.dataset.id;
            const tx = ReconState.transactions.find(t => t.id === txId);
            if (tx) {
                tx.vehiclePlate = e.target.value.trim();
                window.showToast(`Placa actualizada para ${tx.description.substring(0, 15)}...`, 'success');
            }
        });
    });
}

// --- MODALS & WORKFLOWS ---

function initModalListeners() {
    // Add Transaction manual trigger
    reconElements.btnAddTx.addEventListener('click', () => {
        openTxModal();
    });

    // Close modals triggers
    document.getElementById('btn-close-modal-tx').addEventListener('click', () => closeModal(reconElements.modalTx));
    document.getElementById('btn-cancel-modal-tx').addEventListener('click', () => closeModal(reconElements.modalTx));
    document.getElementById('btn-close-modal-upload').addEventListener('click', () => closeModal(reconElements.modalUpload));
    document.getElementById('btn-cancel-modal-upload').addEventListener('click', () => closeModal(reconElements.modalUpload));
    document.getElementById('btn-close-modal-view').addEventListener('click', () => closeModal(reconElements.modalView));
    document.getElementById('btn-close-view-invoice').addEventListener('click', () => closeModal(reconElements.modalView));

    // Purchasing Report triggers
    const btnPurchasing = document.getElementById('btn-purchasing-report');
    if (btnPurchasing) {
        btnPurchasing.addEventListener('click', () => {
            openPurchasingReportModal();
        });
    }
    const btnClosePurchasing = document.getElementById('btn-close-modal-purchasing');
    if (btnClosePurchasing) {
        btnClosePurchasing.addEventListener('click', () => {
            closeModal(document.getElementById('modal-purchasing-report'));
        });
    }
    const btnCancelPurchasing = document.getElementById('btn-cancel-purchasing-modal');
    if (btnCancelPurchasing) {
        btnCancelPurchasing.addEventListener('click', () => {
            closeModal(document.getElementById('modal-purchasing-report'));
        });
    }
    const btnPdfPurchasing = document.getElementById('btn-generate-purchasing-pdf');
    if (btnPdfPurchasing) {
        btnPdfPurchasing.addEventListener('click', () => {
            generatePurchasingPDFReport();
        });
    }
    const btnCsvPurchasing = document.getElementById('btn-export-purchasing-csv');
    if (btnCsvPurchasing) {
        btnCsvPurchasing.addEventListener('click', () => {
            exportPurchasingCSV();
        });
    }

    const btnSavePurchasing = document.getElementById('btn-save-purchasing-changes');
    if (btnSavePurchasing) {
        btnSavePurchasing.addEventListener('click', () => {
            syncPurchasingItemsFromDOM();
            savePurchasingItemsToStorage();
            window.showToast('Cambios en productos y facturas guardados con éxito', 'success');
        });
    }

    initPurchasingLightboxControls();

    // Handle manual transaction submit
    reconElements.formTx.addEventListener('submit', (e) => {
        e.preventDefault();
        saveTxFromModal();
    });

    // Handle single invoice upload triggers
    reconElements.inputSingleInvoice.addEventListener('change', (e) => {
        handleSingleInvoiceSelection(e.target.files[0]);
    });

    const dropSingle = document.getElementById('drop-single-invoice');
    dropSingle.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropSingle.classList.add('dragover');
    });
    dropSingle.addEventListener('dragleave', () => {
        dropSingle.classList.remove('dragover');
    });
    dropSingle.addEventListener('drop', (e) => {
        e.preventDefault();
        dropSingle.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleSingleInvoiceSelection(e.dataTransfer.files[0]);
        }
    });

    reconElements.btnProcessSingleInvoice.addEventListener('click', () => {
        processSingleInvoiceUpload();
    });

    reconElements.btnLinkInvoiceManually.addEventListener('click', () => {
        linkInvoiceManuallyToTx();
    });

    const btnAssignOrphan = document.getElementById('btn-assign-selected-orphan');
    if (btnAssignOrphan) {
        btnAssignOrphan.addEventListener('click', () => {
            const selectOrphan = document.getElementById('select-orphan-invoice-to-assign');
            const targetTx = ReconState.singleInvoiceTargetTx;
            if (!selectOrphan || !targetTx) return;
            
            const selectedName = selectOrphan.value;
            const invoice = ReconState.invoices.find(i => i.name === selectedName);
            if (!invoice) {
                window.showToast('No se encontró la factura seleccionada', 'error');
                return;
            }
            
            if (!targetTx.invoices) targetTx.invoices = [];
            targetTx.invoices.push(invoice);
            targetTx.matched = true;
            targetTx.isManual = true;
            targetTx.isReimbursement = false;
            if (targetTx.reimbursementDoc) {
                targetTx.reimbursementDoc.matched = false;
                targetTx.reimbursementDoc.isManual = false;
                const docIdx = ReconState.invoices.findIndex(i => i.name === targetTx.reimbursementDoc.name);
                if (docIdx !== -1) {
                    ReconState.invoices.splice(docIdx, 1);
                }
                targetTx.reimbursementDoc = null;
            }
            invoice.matched = true;
            invoice.isManual = true;
            invoice.currency = targetTx.currency;
            if (!invoice.extractedAmount) invoice.extractedAmount = targetTx.amount;
            if (!invoice.extractedDateStr) {
                invoice.extractedDateStr = targetTx.dateStr;
                invoice.extractedDate = targetTx.date;
            }
            
            window.showToast(`Factura "${invoice.name}" asignada exitosamente`, 'success');
            closeModal(reconElements.modalUpload);
            runMatchingAlgorithm();
            renderReconciliationUI();
        });
    }

    const unlinkBtn = document.getElementById('btn-unlink-invoice');
    if (unlinkBtn) {
        unlinkBtn.addEventListener('click', () => {
            unlinkInvoiceManually();
        });
    }

    const typeSelect = document.getElementById('view-invoice-type');
    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            handleInvoiceTypeChange();
        });
    }

    const baseInput = document.getElementById('input-view-retention-base');
    if (baseInput) {
        baseInput.addEventListener('change', () => {
            const invoice = ReconState.activeInvoiceToLink;
            if (invoice) {
                invoice.baseAmount = parseFloat(baseInput.value) || null;
                runMatchingAlgorithm();
                const invCurrency = ReconState.activeTxToUnlink ? ReconState.activeTxToUnlink.currency : (invoice.currency || 'NIO');
                const baseAmt = invoice.baseAmount ? window.formatCurrency(invoice.baseAmount, invCurrency) : 'No detectada';
                const withheldAmt = invoice.withheldAmount ? window.formatCurrency(invoice.withheldAmount, invCurrency) : 'No detectado';
                const typeName = invoice.docType === 'retencion_ir' ? 'Retención IR' : 'Retención Municipal';
                reconElements.viewInvoiceAmount.innerHTML = `<span style="font-size:0.85rem;">${typeName}<br/>Base: ${baseAmt}<br/>Retenido: ${withheldAmt}</span>`;
                renderReconciliationUI();
            }
        });
    }

    const withheldInput = document.getElementById('input-view-retention-withheld');
    if (withheldInput) {
        withheldInput.addEventListener('change', () => {
            const invoice = ReconState.activeInvoiceToLink;
            if (invoice) {
                invoice.withheldAmount = parseFloat(withheldInput.value) || null;
                runMatchingAlgorithm();
                const invCurrency = ReconState.activeTxToUnlink ? ReconState.activeTxToUnlink.currency : (invoice.currency || 'NIO');
                const baseAmt = invoice.baseAmount ? window.formatCurrency(invoice.baseAmount, invCurrency) : 'No detectada';
                const withheldAmt = invoice.withheldAmount ? window.formatCurrency(invoice.withheldAmount, invCurrency) : 'No detectado';
                const typeName = invoice.docType === 'retencion_ir' ? 'Retención IR' : 'Retención Municipal';
                reconElements.viewInvoiceAmount.innerHTML = `<span style="font-size:0.85rem;">${typeName}<br/>Base: ${baseAmt}<br/>Retenido: ${withheldAmt}</span>`;
                renderReconciliationUI();
            }
        });
    }

    // Live editing for Provider RUC, Invoice Number and Date
    const inputRuc = document.getElementById('input-view-invoice-ruc');
    if (inputRuc) {
        inputRuc.addEventListener('input', () => {
            const invoice = ReconState.activeInvoiceToLink;
            if (invoice) {
                const val = inputRuc.value.trim().toUpperCase();
                invoice.providerRuc = val || null;
                invoice.hasSinsaRuc = !!val;
                renderReconciliationUI();
            }
        });
    }

    const inputInvNo = document.getElementById('input-view-invoice-number');
    if (inputInvNo) {
        inputInvNo.addEventListener('input', () => {
            const invoice = ReconState.activeInvoiceToLink;
            if (invoice) {
                invoice.invoiceRef = inputInvNo.value.trim() || null;
                renderReconciliationUI();
            }
        });
    }

    const inputDate = document.getElementById('input-view-invoice-date');
    if (inputDate) {
        inputDate.addEventListener('input', () => {
            const invoice = ReconState.activeInvoiceToLink;
            if (invoice) {
                invoice.extractedDateStr = inputDate.value.trim();
                renderReconciliationUI();
            }
        });
    }

    initInvoiceZoomControls();
}

// --- INVOICE IMAGE ZOOM & PAN CONTROLS ---

let invoiceZoomState = {
    scale: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    isDragging: false,
    startX: 0,
    startY: 0
};

function applyInvoiceZoom() {
    const img = document.getElementById('view-invoice-img');
    const badge = document.getElementById('zoom-level-badge');
    if (!img) return;
    
    img.style.transform = `translate(${invoiceZoomState.panX}px, ${invoiceZoomState.panY}px) scale(${invoiceZoomState.scale}) rotate(${invoiceZoomState.rotation}deg)`;
    if (badge) {
        badge.textContent = `${Math.round(invoiceZoomState.scale * 100)}%`;
    }
}

function resetInvoiceZoom() {
    invoiceZoomState.scale = 1;
    invoiceZoomState.panX = 0;
    invoiceZoomState.panY = 0;
    invoiceZoomState.rotation = 0;
    invoiceZoomState.isDragging = false;
    applyInvoiceZoom();
}

function initInvoiceZoomControls() {
    const viewport = document.getElementById('invoice-zoom-viewport');
    const btnIn = document.getElementById('btn-zoom-in');
    const btnOut = document.getElementById('btn-zoom-out');
    const btnReset = document.getElementById('btn-zoom-reset');
    const btnRotate = document.getElementById('btn-zoom-rotate');
    
    if (btnIn) {
        btnIn.addEventListener('click', (e) => {
            e.stopPropagation();
            invoiceZoomState.scale = Math.min(invoiceZoomState.scale * 1.25, 5);
            applyInvoiceZoom();
        });
    }
    
    if (btnOut) {
        btnOut.addEventListener('click', (e) => {
            e.stopPropagation();
            invoiceZoomState.scale = Math.max(invoiceZoomState.scale / 1.25, 0.4);
            applyInvoiceZoom();
        });
    }
    
    if (btnReset) {
        btnReset.addEventListener('click', (e) => {
            e.stopPropagation();
            resetInvoiceZoom();
        });
    }
    
    if (btnRotate) {
        btnRotate.addEventListener('click', (e) => {
            e.stopPropagation();
            invoiceZoomState.rotation = (invoiceZoomState.rotation + 90) % 360;
            applyInvoiceZoom();
        });
    }
    
    if (viewport) {
        // Mouse Wheel Zoom
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.15 : 0.87;
            const newScale = Math.min(Math.max(invoiceZoomState.scale * delta, 0.4), 5);
            invoiceZoomState.scale = newScale;
            applyInvoiceZoom();
        }, { passive: false });
        
        // Pan / Drag
        viewport.addEventListener('mousedown', (e) => {
            if (e.target.closest('#invoice-zoom-toolbar')) return;
            invoiceZoomState.isDragging = true;
            invoiceZoomState.startX = e.clientX - invoiceZoomState.panX;
            invoiceZoomState.startY = e.clientY - invoiceZoomState.panY;
            viewport.classList.add('is-dragging');
        });
        
        window.addEventListener('mousemove', (e) => {
            if (!invoiceZoomState.isDragging) return;
            invoiceZoomState.panX = e.clientX - invoiceZoomState.startX;
            invoiceZoomState.panY = e.clientY - invoiceZoomState.startY;
            applyInvoiceZoom();
        });
        
        window.addEventListener('mouseup', () => {
            if (invoiceZoomState.isDragging) {
                invoiceZoomState.isDragging = false;
                if (viewport) viewport.classList.remove('is-dragging');
            }
        });
        
        // Double Click to toggle zoom
        viewport.addEventListener('dblclick', (e) => {
            if (e.target.closest('#invoice-zoom-toolbar')) return;
            if (invoiceZoomState.scale > 1.1) {
                resetInvoiceZoom();
            } else {
                invoiceZoomState.scale = 2.2;
                applyInvoiceZoom();
            }
        });
    }
}

function openTxModal(tx = null) {
    if (tx) {
        reconElements.modalTitle.textContent = 'Editar Transacción';
        reconElements.inputTxId.value = tx.id;
        
        // Date formats mapping
        let dateVal = "";
        if (tx.date) {
            const year = tx.date.getFullYear();
            const month = String(tx.date.getMonth() + 1).padStart(2, '0');
            const day = String(tx.date.getDate()).padStart(2, '0');
            dateVal = `${year}-${month}-${day}`;
        }
        reconElements.inputTxDate.value = dateVal;
        reconElements.inputTxReference.value = tx.reference || '';
        reconElements.inputTxDesc.value = tx.description;
        reconElements.inputTxCurrency.value = tx.currency || 'NIO';
        reconElements.inputTxAmount.value = tx.amount;
    } else {
        reconElements.modalTitle.textContent = 'Añadir Transacción Manual';
        reconElements.inputTxId.value = '';
        reconElements.formTx.reset();
        
        // Set today's date by default
        const today = new Date();
        reconElements.inputTxDate.value = today.toISOString().split('T')[0];
        reconElements.inputTxReference.value = '';
        reconElements.inputTxCurrency.value = 'NIO';
    }
    reconElements.modalTx.classList.add('active');
}

function saveTxFromModal() {
    const txId = reconElements.inputTxId.value;
    const dateVal = reconElements.inputTxDate.value;
    const refVal = reconElements.inputTxReference.value.trim();
    const descVal = reconElements.inputTxDesc.value.trim();
    const currencyVal = reconElements.inputTxCurrency.value;
    const amountVal = parseFloat(reconElements.inputTxAmount.value);

    if (!dateVal || !descVal || isNaN(amountVal)) {
        window.showToast('Por favor completa todos los campos requeridos', 'error');
        return;
    }

    const dateParts = dateVal.split('-');
    const formattedDateStr = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
    const dateObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));

    const descLower = descVal.toLowerCase();
    const isCredit = (amountVal < 0 || descLower.includes('bonific') || descLower.includes('devoluc') || descLower.includes('nota de cred') || descLower.includes('credito') || descLower.includes('crédito'));
    const txType = isCredit ? 'credit' : 'charge';
    const finalAmount = Math.abs(amountVal);

    if (txId) {
        // Edit mode
        const tx = ReconState.transactions.find(t => t.id === txId);
        if (tx) {
            // Unbind invoice if amount, currency or type changes to prevent inconsistencies
            if (tx.matched && (tx.amount !== finalAmount || tx.currency !== currencyVal || tx.type !== txType)) {
                if (tx.invoices) {
                    tx.invoices.forEach(inv => { inv.matched = false; });
                } else if (tx.invoice) {
                    tx.invoice.matched = false;
                }
                tx.matched = false;
                tx.invoices = [];
                tx.invoice = null;
            }
            tx.dateStr = formattedDateStr;
            tx.date = dateObj;
            tx.reference = refVal;
            tx.description = descVal;
            tx.currency = currencyVal;
            tx.amount = finalAmount;
            tx.type = txType;
            window.showToast('Transacción editada', 'success');
        }
    } else {
        // Add Mode
        const newId = 'tx-manual-' + Date.now();
        ReconState.transactions.push({
            id: newId,
            dateStr: formattedDateStr,
            date: dateObj,
            reference: refVal,
            description: descVal,
            currency: currencyVal,
            amount: finalAmount,
            type: txType,
            matched: false,
            invoice: null
        });
        window.showToast('Transacción manual agregada', 'success');
    }

    closeModal(reconElements.modalTx);
    runMatchingAlgorithm();
    renderReconciliationUI();
}

function openUploadModalForTx(txOrGroup, isReimbursement = false, isRetention = false, retentionType = null, isPurchaseOrder = false) {
    const isGroup = Array.isArray(txOrGroup);
    const tx = isGroup ? txOrGroup[0] : txOrGroup;
    
    ReconState.singleInvoiceTargetTx = tx;
    ReconState.targetTxGroup = isGroup ? txOrGroup : [txOrGroup];
    ReconState.uploadIsReimbursement = isReimbursement;
    ReconState.uploadIsRetention = isRetention;
    ReconState.uploadRetentionType = retentionType;
    ReconState.uploadIsPurchaseOrder = isPurchaseOrder;
    
    // Customize modal headers depending on whether it's a reimbursement, retention, or normal invoice
    const modalTitle = document.querySelector('#modal-upload-invoice h3');
    const modalInstruction = document.querySelector('#target-tx-info p');
    const dropZoneText = document.querySelector('#drop-single-invoice .drop-text');
    
    if (isRetention) {
        let typeName = "Retención / Exención";
        if (retentionType === 'retencion_ir') {
            typeName = "Retención IR 2%";
        } else if (retentionType === 'retencion_municipal') {
            typeName = "Retención Municipal 1%";
        } else if (retentionType === 'exencion') {
            typeName = "Exención de Impuestos";
        }
        
        if (modalTitle) modalTitle.textContent = `Subir ${typeName}`;
        if (modalInstruction) modalInstruction.textContent = `Subir ${typeName.toLowerCase()} para la transacción:`;
        if (dropZoneText) dropZoneText.textContent = `Arrastra el documento de ${typeName.toLowerCase()} (imagen o PDF) o haz clic aquí`;
    } else if (isPurchaseOrder) {
        if (modalTitle) modalTitle.textContent = 'Subir Orden de Compra (OC)';
        if (modalInstruction) modalInstruction.textContent = 'Subir Orden de Compra para la transacción:';
        if (dropZoneText) dropZoneText.textContent = 'Arrastra la Orden de Compra (imagen o PDF) o haz clic aquí';
    } else if (isReimbursement) {
        if (modalTitle) {
            modalTitle.textContent = isGroup ? 'Subir Comprobante de Depósito / Transferencia (Grupo)' : 'Subir Comprobante de Depósito / Transferencia';
        }
        if (modalInstruction) {
            modalInstruction.textContent = isGroup ? 'Subir comprobante de depósito o transferencia para reembolsar el grupo de transacciones:' : 'Subir comprobante de depósito o transferencia para reembolsar a la empresa:';
        }
        if (dropZoneText) dropZoneText.textContent = 'Arrastra el comprobante (imagen o PDF) o haz clic aquí';
    } else {
        if (modalTitle) modalTitle.textContent = 'Subir Respaldo de Factura';
        if (modalInstruction) modalInstruction.textContent = 'Subir factura de respaldo para la transacción:';
        if (dropZoneText) dropZoneText.textContent = 'Arrastra la factura (imagen o PDF) o haz clic aquí';
    }

    // Fill transaction details
    if (isGroup) {
        const count = txOrGroup.length;
        reconElements.targetTxDate.textContent = 'Múltiples Fechas';
        reconElements.targetTxDesc.textContent = `${count} transacciones seleccionadas`;
        
        const sumNIO = txOrGroup.filter(t => t.currency === 'NIO').reduce((sum, t) => sum + t.amount, 0);
        const sumUSD = txOrGroup.filter(t => t.currency === 'USD').reduce((sum, t) => sum + t.amount, 0);
        const sumParts = [];
        if (sumNIO > 0) sumParts.push(window.formatCurrency(sumNIO, 'NIO'));
        if (sumUSD > 0) sumParts.push(window.formatCurrency(sumUSD, 'USD'));
        reconElements.targetTxAmount.textContent = sumParts.join(' / ');
    } else {
        reconElements.targetTxDate.textContent = tx.dateStr;
        reconElements.targetTxDesc.textContent = tx.description;
        reconElements.targetTxAmount.textContent = window.formatCurrency(tx.amount, tx.currency);
    }
    
    // Reset file input inside modal
    reconElements.inputSingleInvoice.value = '';
    reconElements.singleInvoiceFileInfo.textContent = 'Ningún archivo seleccionado';
    reconElements.singleInvoiceFileInfo.style.color = '';
    reconElements.btnProcessSingleInvoice.setAttribute('disabled', 'true');
    reconElements.singleInvoiceProgress.classList.add('hidden');
    
    // Configure orphan invoice picker if unassigned invoices are available
    const containerPickOrphan = document.getElementById('container-pick-orphan-invoice');
    const selectOrphan = document.getElementById('select-orphan-invoice-to-assign');
    if (containerPickOrphan && selectOrphan) {
        if (!isReimbursement && !isRetention && !isPurchaseOrder) {
            const unassignedInvoices = ReconState.invoices.filter(i => !i.matched && (i.docType === 'invoice' || !i.docType));
            if (unassignedInvoices.length > 0) {
                selectOrphan.innerHTML = '';
                unassignedInvoices.forEach(inv => {
                    const opt = document.createElement('option');
                    opt.value = inv.name;
                    const amtStr = inv.extractedAmount ? window.formatCurrency(inv.extractedAmount, inv.currency || 'NIO') : 'Monto N/A';
                    opt.textContent = `${inv.name} | ${inv.extractedDateStr || 'Sin fecha'} | ${amtStr}`;
                    selectOrphan.appendChild(opt);
                });
                containerPickOrphan.classList.remove('hidden');
            } else {
                containerPickOrphan.classList.add('hidden');
            }
        } else {
            containerPickOrphan.classList.add('hidden');
        }
    }
    
    reconElements.modalUpload.classList.add('active');
}

let singleInvoiceFileObj = null;
function handleSingleInvoiceSelection(file) {
    if (!file || (!file.type.startsWith('image/') && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) {
        window.showToast('Por favor selecciona una imagen o un archivo PDF válido', 'error');
        return;
    }
    singleInvoiceFileObj = file;
    reconElements.singleInvoiceFileInfo.textContent = `${file.name} (${formatBytes(file.size)})`;
    reconElements.singleInvoiceFileInfo.style.color = 'var(--color-success)';
    reconElements.btnProcessSingleInvoice.removeAttribute('disabled');
    window.showToast(file.name.toLowerCase().endsWith('.pdf') ? 'Archivo PDF seleccionado' : 'Imagen seleccionada', 'success');
}

async function processSingleInvoiceUpload() {
    if (!singleInvoiceFileObj || !ReconState.singleInvoiceTargetTx) return;

    const isPdf = singleInvoiceFileObj.name.toLowerCase().endsWith('.pdf') || singleInvoiceFileObj.type === 'application/pdf';

    try {
        reconElements.singleInvoiceProgress.classList.remove('hidden');
        reconElements.btnProcessSingleInvoice.setAttribute('disabled', 'true');
        
        let text = "";
        let confidence = 100;
        let isLowQuality = false;
        let imageSrc = "";

        let base64 = "";
        if (isPdf) {
            updateSingleProgress(30, 'Leyendo archivo PDF...');
            const arrayBuffer = await readFileAsArrayBuffer(singleInvoiceFileObj);
            
            updateSingleProgress(60, 'Extrayendo texto del PDF...');
            text = await extractPdfText(arrayBuffer);
            
            updateSingleProgress(80, 'Renderizando primera página del PDF...');
            try {
                imageSrc = await convertPdfToImage(arrayBuffer);
                base64 = imageSrc;
            } catch (renderErr) {
                console.error("Error rendering uploaded PDF:", renderErr);
                base64 = await blobToBase64(singleInvoiceFileObj);
                imageSrc = base64;
            }
        } else {
            const blob = singleInvoiceFileObj;
            base64 = await blobToBase64(blob);
            imageSrc = base64;

            updateSingleProgress(10, 'Iniciando OCR...');
            
            updateSingleProgress(25, 'Cargando motor de OCR...');
            const worker = await Tesseract.createWorker('spa+eng');
            
            updateSingleProgress(45, 'Optimizando resolución, binarización y nitidez...');
            updateSingleProgress(65, 'Escaneando texto con OCR Inteligente...');
            const ocrResult = await runSmartOCR(worker, imageSrc, singleInvoiceFileObj.name);
            text = ocrResult.text;
            confidence = ocrResult.confidence || 0;
            isLowQuality = (confidence < 45) || (text.trim().length < 35);
            
            await worker.terminate();
        }

        updateSingleProgress(92, 'Clasificando documento...');
        
        const targetTx = ReconState.singleInvoiceTargetTx;
        const isReimbursementUpload = ReconState.uploadIsReimbursement;

        let docDetails;
        if (isReimbursementUpload) {
            docDetails = {
                docType: 'reimbursement_receipt',
                invoiceRef: null,
                baseAmount: null,
                withheldAmount: null,
                amount: targetTx.amount,
                subtotal: null,
                dateStr: targetTx.dateStr,
                date: targetTx.date,
                currency: targetTx.currency
            };
        } else if (ReconState.uploadIsRetention) {
            const rawDetails = classifyAndExtractDocument(text, singleInvoiceFileObj.name);
            const retentionType = ReconState.uploadRetentionType;
            docDetails = {
                ...rawDetails,
                docType: retentionType
            };
            // Force extraction of base and withheld amounts for retentions
            if (retentionType === 'retencion_ir' || retentionType === 'retencion_municipal') {
                if (!docDetails.baseAmount) {
                    const baseMatch = text.match(/(?:valor imponible|valor de la factura|valor factura|monto imponible|imponible)\s*(?:c\$|\$)?\s*([\d,]+\.\d{2})/i);
                    if (baseMatch) {
                        docDetails.baseAmount = parseFloat(baseMatch[1].replace(/,/g, ''));
                    } else {
                        docDetails.baseAmount = targetTx.amount / 1.15;
                    }
                }
                if (!docDetails.withheldAmount) {
                    const withheldMatch = text.match(/(?:valor retenido|monto retenido|total retenido|retenido c\$|retenido \$)\s*(?:c\$|\$)?\s*([\d,]+\.\d{2})/i);
                    if (withheldMatch) {
                        docDetails.withheldAmount = parseFloat(withheldMatch[1].replace(/,/g, ''));
                    } else {
                        const rate = retentionType === 'retencion_ir' ? 0.02 : 0.01;
                        docDetails.withheldAmount = docDetails.baseAmount * rate;
                    }
                }
            }
        } else {
            docDetails = classifyAndExtractDocument(text, singleInvoiceFileObj.name);
        }
        
        if (!isPdf) {
            isLowQuality = isLowQuality || (text.trim().length < 40 && docDetails.docType === 'invoice' && !docDetails.amount && !docDetails.date);
        }

        // Match verification: create the document object
        const newDoc = {
            name: singleInvoiceFileObj.name,
            imageSrc: imageSrc,
            base64: base64,
            blob: singleInvoiceFileObj,
            text: text,
            docType: docDetails.docType,
            invoiceRef: docDetails.invoiceRef,
            baseAmount: docDetails.baseAmount,
            withheldAmount: docDetails.withheldAmount,
            extractedAmount: docDetails.amount || (docDetails.docType === 'invoice' ? targetTx.amount : null),
            extractedSubtotal: docDetails.subtotal || null,
            extractedDateStr: docDetails.dateStr,
            extractedDate: docDetails.date,
            matched: true,
            lowQuality: isLowQuality,
            confidence: confidence,
            currency: targetTx.currency || docDetails.currency || 'NIO',
            purchaseOrderRef: docDetails.purchaseOrderRef || null,
            providerRuc: docDetails.providerRuc || null,
            hasSinsaRuc: docDetails.hasSinsaRuc || false
        };

        // Link with the transaction
        if (ReconState.uploadIsPurchaseOrder) {
            targetTx.purchaseOrderDoc = newDoc;
            newDoc.docType = 'orden_compra';
            newDoc.matched = true;
            newDoc.isManual = true;
            window.showToast('Orden de Compra vinculada a la transacción', 'success');
        } else if (isReimbursementUpload) {
            const targets = ReconState.targetTxGroup || [targetTx];
            targets.forEach(t => {
                t.isReimbursement = true;
                t.matched = true;
                t.isManual = true;
                t.reimbursementDoc = newDoc;
            });
            newDoc.isManual = true;
            if (targets.length > 1) {
                window.showToast(`Comprobante asociado y reembolso registrado para ${targets.length} transacciones`, 'success');
            } else {
                window.showToast('Comprobante de depósito asociado y reembolso registrado', 'success');
            }
        } else if (ReconState.uploadIsRetention) {
            // Force associate this doc to the target transaction as tax retention/exemption
            if (docDetails.docType === 'retencion_ir') {
                targetTx.hasRetencionIR = true;
                targetTx.retentionIRDoc = newDoc;
                newDoc.matched = true;
                newDoc.isManual = true;
            } else if (docDetails.docType === 'retencion_municipal') {
                targetTx.hasRetencionMunicipal = true;
                targetTx.retentionMunicipalDoc = newDoc;
                newDoc.matched = true;
                newDoc.isManual = true;
            } else if (docDetails.docType === 'exencion') {
                targetTx.isExempt = true;
                targetTx.exemptionDoc = newDoc;
                newDoc.matched = true;
                newDoc.isManual = true;
            }
            window.showToast(`Documento de tipo "${docDetails.docType.toUpperCase()}" cargado`, 'success');
        } else {
            // Default "Subir Factura" action: Always link as the main invoice support so the transaction is reconciled!
            newDoc.docType = 'invoice';
            if (!targetTx.invoices) targetTx.invoices = [];
            targetTx.matched = true;
            targetTx.isReimbursement = false;
            targetTx.reimbursementDoc = null;
            targetTx.invoices.push(newDoc);
            targetTx.isManual = true;
            newDoc.isManual = true;
            newDoc.matched = true;
            window.showToast(`Factura "${newDoc.name}" cargada y vinculada exitosamente`, 'success');
        }
        ReconState.invoices.push(newDoc);

        updateSingleProgress(100, '¡Documento vinculado con éxito!');

        setTimeout(() => {
            closeModal(reconElements.modalUpload);
            runMatchingAlgorithm();
            renderReconciliationUI();
        }, 1000);

    } catch (err) {
        console.error(err);
        window.showToast(`Error al procesar el archivo: ${err.message}`, 'error');
        updateSingleProgress(0, 'Error de lectura');
        reconElements.btnProcessSingleInvoice.removeAttribute('disabled');
    }
}

function updateSingleProgress(percent, text) {
    reconElements.singleInvoiceProgressFill.style.width = `${percent}%`;
    reconElements.singleInvoiceProgressStatus.textContent = text;
    reconElements.singleInvoiceProgressPercent.textContent = `${percent}%`;
}

function openViewInvoiceModal(invoice, tx = null) {
    ReconState.activeInvoiceToLink = invoice;
    ReconState.activeTxToUnlink = tx;
    
    const typeSelect = document.getElementById('view-invoice-type');
    if (typeSelect) {
        typeSelect.value = invoice.docType || 'invoice';
        if (invoice.docType === 'reimbursement_receipt') {
            typeSelect.setAttribute('disabled', 'true');
        } else {
            typeSelect.removeAttribute('disabled');
        }
    }

    const modalTitle = document.querySelector('#modal-view-invoice h3');
    if (modalTitle) {
        if (invoice.docType === 'retencion_ir') {
            modalTitle.textContent = 'Visualizar Retención IR';
        } else if (invoice.docType === 'retencion_municipal') {
            modalTitle.textContent = 'Visualizar Retención Municipal';
        } else if (invoice.docType === 'exencion') {
            modalTitle.textContent = 'Visualizar Exención de Impuestos';
        } else if (invoice.docType === 'reimbursement_receipt') {
            modalTitle.textContent = 'Visualizar Comprobante de Reembolso';
        } else if (invoice.docType === 'orden_compra') {
            modalTitle.textContent = 'Visualizar Orden de Compra';
        } else {
            modalTitle.textContent = 'Visualizar Factura de Respaldo';
        }
    }
    
    resetInvoiceZoom();
    const zoomToolbar = document.getElementById('invoice-zoom-toolbar');
    const openFullLink = document.getElementById('btn-open-full-image');
    
    const viewPdfIframe = document.getElementById('view-invoice-pdf');
    const isPdfDoc = invoice.name.toLowerCase().endsWith('.pdf') && invoice.imageSrc && invoice.imageSrc.startsWith('data:application/pdf');
    if (isPdfDoc) {
        if (zoomToolbar) zoomToolbar.classList.add('hidden');
        if (viewPdfIframe) {
            viewPdfIframe.src = invoice.imageSrc;
            viewPdfIframe.classList.remove('hidden');
            reconElements.viewInvoiceImg.classList.add('hidden');
        }
    } else {
        if (zoomToolbar) zoomToolbar.classList.remove('hidden');
        if (viewPdfIframe) {
            viewPdfIframe.src = "";
            viewPdfIframe.classList.add('hidden');
        }
        reconElements.viewInvoiceImg.classList.remove('hidden');
        if (!invoice.imageSrc) {
            // Check if it's a PDF but we have no image (e.g. historical load with missing imageSrc)
            if (invoice.name.replace(/\s*\(Pág\.\s*\d+\)$/i, "").toLowerCase().endsWith('.pdf')) {
                reconElements.viewInvoiceImg.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2338bdf8" font-family="sans-serif" font-size="18" font-weight="bold">Documento PDF Cargado</text><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="14" font-weight="bold">${invoice.name}</text><text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="12">Texto extraído mediante PDF.js con 100% de precisión.</text></svg>`;
            } else {
                // inline SVG placeholder warning "Imagen no disponible en historial"
                reconElements.viewInvoiceImg.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="16" font-weight="bold">Imagen de Factura no Guardada</text><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="12">Las imágenes se omiten en la persistencia del historial</text><text x="50%" y="62%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="12">para respetar el límite de almacenamiento del navegador.</text></svg>`;
            }
            if (openFullLink) openFullLink.classList.add('hidden');
        } else {
            reconElements.viewInvoiceImg.src = invoice.imageSrc;
            if (openFullLink) {
                openFullLink.href = invoice.imageSrc;
                openFullLink.classList.remove('hidden');
            }
        }
    }
    reconElements.viewInvoiceName.textContent = invoice.name;
    if (reconElements.viewInvoiceDate) {
        if ('value' in reconElements.viewInvoiceDate) {
            reconElements.viewInvoiceDate.value = invoice.extractedDateStr || (tx ? tx.dateStr : '');
        } else {
            reconElements.viewInvoiceDate.textContent = invoice.extractedDateStr || 'No identificada';
        }
    }
    
    const invCurrency = tx ? tx.currency : (invoice.currency || 'NIO');
    const rowBase = document.getElementById('row-retention-base');
    const rowWithheld = document.getElementById('row-retention-withheld');
    const inputBase = document.getElementById('input-view-retention-base');
    const inputWithheld = document.getElementById('input-view-retention-withheld');

    if (invoice.docType === 'retencion_ir' || invoice.docType === 'retencion_municipal') {
        if (rowBase) rowBase.classList.remove('hidden');
        if (rowWithheld) rowWithheld.classList.remove('hidden');
        if (inputBase) inputBase.value = invoice.baseAmount || '';
        if (inputWithheld) inputWithheld.value = invoice.withheldAmount || '';

        const baseAmt = invoice.baseAmount ? window.formatCurrency(invoice.baseAmount, invCurrency) : 'No detectada';
        const withheldAmt = invoice.withheldAmount ? window.formatCurrency(invoice.withheldAmount, invCurrency) : 'No detectado';
        const typeName = invoice.docType === 'retencion_ir' ? 'Retención IR' : 'Retención Municipal';
        reconElements.viewInvoiceAmount.innerHTML = `<span style="font-size:0.85rem;">${typeName}<br/>Base: ${baseAmt}<br/>Retenido: ${withheldAmt}</span>`;
    } else {
        if (rowBase) rowBase.classList.add('hidden');
        if (rowWithheld) rowWithheld.classList.add('hidden');
        if (invoice.docType === 'exencion') {
            reconElements.viewInvoiceAmount.textContent = 'Exención de Impuestos';
        } else if (invoice.docType === 'orden_compra') {
            const poNo = invoice.purchaseOrderRef ? `(N°. ${invoice.purchaseOrderRef})` : '';
            reconElements.viewInvoiceAmount.textContent = `Orden de Compra ${poNo} - ${invoice.extractedAmount ? window.formatCurrency(invoice.extractedAmount, invCurrency) : 'Monto no detectado'}`;
        } else {
            reconElements.viewInvoiceAmount.textContent = invoice.extractedAmount ? window.formatCurrency(invoice.extractedAmount, invCurrency) : 'No detectado';
        }
    }

    // Fallback date from transaction if not present
    if (tx && (!invoice.extractedDateStr || invoice.extractedDateStr === 'No identificada')) {
        invoice.extractedDateStr = tx.dateStr;
        invoice.extractedDate = tx.date;
    }

    const inputDate = document.getElementById('input-view-invoice-date');
    if (inputDate) {
        inputDate.value = invoice.extractedDateStr || (tx ? tx.dateStr : '');
    }

    // Populate RUC and Invoice Number fields for standard invoices
    const rowRuc = document.getElementById('row-invoice-ruc');
    const rowInvNo = document.getElementById('row-invoice-number');
    const inputRuc = document.getElementById('input-view-invoice-ruc');
    const inputInvNo = document.getElementById('input-view-invoice-number');

    if (invoice.docType === 'invoice') {
        if (rowRuc) rowRuc.classList.remove('hidden');
        if (rowInvNo) rowInvNo.classList.remove('hidden');
        if (inputRuc) inputRuc.value = invoice.providerRuc || '';
        if (inputInvNo) inputInvNo.value = invoice.invoiceRef || '';
    } else {
        if (rowRuc) rowRuc.classList.add('hidden');
        if (rowInvNo) rowInvNo.classList.add('hidden');
    }
    
    const unlinkBtn = document.getElementById('btn-unlink-invoice');
    
    if (tx) {
        reconElements.viewInvoiceTxAmount.textContent = window.formatCurrency(tx.amount, tx.currency);
        reconElements.viewInvoiceLinkContainer.classList.add('hidden');
        if (unlinkBtn) {
            if (invoice.docType === 'reimbursement_receipt') {
                unlinkBtn.classList.add('hidden');
            } else {
                unlinkBtn.classList.remove('hidden');
            }
        }
    } else {
        reconElements.viewInvoiceTxAmount.textContent = 'N/A';
        reconElements.viewInvoiceLinkContainer.classList.remove('hidden');
        if (unlinkBtn) unlinkBtn.classList.add('hidden');
        
        const targetList = ReconState.transactions
            .filter(t => t.type === 'charge')
            .sort((a, b) => (a.matched === b.matched ? 0 : a.matched ? 1 : -1));
        reconElements.selectUnresolvedTxForLinking.innerHTML = '';
        
        if (targetList.length === 0) {
            reconElements.selectUnresolvedTxForLinking.innerHTML = `<option value="">No hay transacciones</option>`;
            reconElements.btnLinkInvoiceManually.setAttribute('disabled', 'true');
        } else {
            reconElements.btnLinkInvoiceManually.removeAttribute('disabled');
            targetList.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                const formattedAmt = t.currency === 'NIO' ? window.formatCurrency(t.amount, 'NIO') : window.formatCurrency(t.amount, 'USD');
                const statusPrefix = t.matched ? '(Ya vinculada) ' : '(Falta respaldo) ';
                opt.textContent = `${statusPrefix}${t.dateStr} | ${t.description.substring(0, 30)} | ${formattedAmt}`;
                reconElements.selectUnresolvedTxForLinking.appendChild(opt);
            });
        }
    }

    // Dynamic warning banner for low legibility images
    const existingWarning = document.getElementById('view-invoice-warning-banner');
    if (existingWarning) existingWarning.remove();

    if (invoice.lowQuality) {
        const warningDiv = document.createElement('div');
        warningDiv.id = 'view-invoice-warning-banner';
        warningDiv.className = 'alert-banner bg-danger-light';
        warningDiv.style.margin = '0 0 1rem 0';
        warningDiv.style.padding = '0.75rem 1rem';
        warningDiv.style.borderRadius = '8px';
        warningDiv.style.border = '1px solid var(--color-danger)';
        warningDiv.innerHTML = `
            <p style="color: var(--color-danger); font-size: 0.85rem; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i>
                <span>Imagen Ilegible (Confianza OCR: ${invoice.confidence}%). Si los datos detectados son erróneos o incompletos, por favor sube una nueva imagen.</span>
            </p>
        `;
        document.querySelector('.invoice-data-details').prepend(warningDiv);
        lucide.createIcons();
    }

    // Escape text to prevent HTML insertion and preserve formatting
    if (reconElements.viewInvoiceRawText) {
        reconElements.viewInvoiceRawText.textContent = invoice.text || 'Sin texto extraído.';
    }
    
    openModal(reconElements.modalView);
    if (window.lucide) window.lucide.createIcons();
}

function linkInvoiceManuallyToTx() {
    const invoice = ReconState.activeInvoiceToLink;
    if (!invoice) return;
    
    const txId = reconElements.selectUnresolvedTxForLinking.value;
    if (!txId) {
        window.showToast('Por favor selecciona una transacción válida', 'error');
        return;
    }
    
    const tx = ReconState.transactions.find(t => t.id === txId);
    if (tx) {
        if (invoice.docType === 'invoice') {
            if (!tx.invoices) tx.invoices = [];
            if (tx.invoices.some(i => i.name === invoice.name)) {
                window.showToast('Esta factura ya está vinculada a esta transacción', 'warning');
                return;
            }
            tx.invoices.push(invoice);
            tx.matched = true;
            tx.isManual = true;
            tx.isReimbursement = false;
            if (tx.reimbursementDoc) {
                tx.reimbursementDoc.matched = false;
                tx.reimbursementDoc.isManual = false;
                const docIdx = ReconState.invoices.findIndex(i => i.name === tx.reimbursementDoc.name);
                if (docIdx !== -1) {
                    ReconState.invoices.splice(docIdx, 1);
                }
                tx.reimbursementDoc = null;
            }
            invoice.matched = true;
            invoice.isManual = true;
            invoice.currency = tx.currency;
            if (!invoice.extractedAmount) {
                invoice.extractedAmount = tx.amount;
            }
            if (!invoice.extractedDateStr) {
                invoice.extractedDateStr = tx.dateStr;
                invoice.extractedDate = tx.date;
            }
        } else if (invoice.docType === 'retencion_ir') {
            tx.hasRetencionIR = true;
            tx.retentionIRDoc = invoice;
            invoice.matched = true;
            invoice.isManual = true;
            if (!invoice.baseAmount) {
                invoice.baseAmount = tx.amount / 1.15;
            }
            if (!invoice.withheldAmount) {
                invoice.withheldAmount = invoice.baseAmount * 0.02;
            }
        } else if (invoice.docType === 'retencion_municipal') {
            tx.hasRetencionMunicipal = true;
            tx.retentionMunicipalDoc = invoice;
            invoice.matched = true;
            invoice.isManual = true;
            if (!invoice.baseAmount) {
                invoice.baseAmount = tx.amount / 1.15;
            }
            if (!invoice.withheldAmount) {
                invoice.withheldAmount = invoice.baseAmount * 0.01;
            }
        } else if (invoice.docType === 'exencion') {
            tx.isExempt = true;
            tx.exemptionDoc = invoice;
            invoice.matched = true;
            invoice.isManual = true;
        } else if (invoice.docType === 'orden_compra') {
            tx.purchaseOrderDoc = invoice;
            invoice.matched = true;
            invoice.isManual = true;
        }
        
        window.showToast('Documento asociado manualmente con éxito', 'success');
        closeModal(reconElements.modalView);
        runMatchingAlgorithm();
        renderReconciliationUI();
    }
}

function unlinkInvoiceManually() {
    const tx = ReconState.activeTxToUnlink;
    const invoice = ReconState.activeInvoiceToLink;
    if (tx && invoice) {
        if (invoice.docType === 'invoice') {
            if (tx.invoices) {
                tx.invoices = tx.invoices.filter(i => i.name !== invoice.name);
            }
            if (!tx.invoices || tx.invoices.length === 0) {
                tx.matched = false;
                tx.isManual = false;
            }
        } else if (invoice.docType === 'retencion_ir') {
            tx.hasRetencionIR = false;
            tx.retentionIRDoc = null;
        } else if (invoice.docType === 'retencion_municipal') {
            tx.hasRetencionMunicipal = false;
            tx.retentionMunicipalDoc = null;
        } else if (invoice.docType === 'exencion') {
            tx.isExempt = false;
            tx.exemptionDoc = null;
        } else if (invoice.docType === 'orden_compra') {
            tx.purchaseOrderDoc = null;
        }
        
        window.showToast('Documento desvinculado', 'info');
    }
    if (invoice) {
        invoice.matched = false;
        invoice.isManual = false;
    }
    closeModal(reconElements.modalView);
    runMatchingAlgorithm();
    renderReconciliationUI();
}

function handleInvoiceTypeChange() {
    const invoice = ReconState.activeInvoiceToLink;
    if (!invoice) return;
    
    const typeSelect = document.getElementById('view-invoice-type');
    if (!typeSelect) return;
    
    const newType = typeSelect.value;
    const oldType = invoice.docType || 'invoice';
    
    if (newType === oldType) return;
    
    // Check if the invoice is currently matched
    const isMatched = invoice.matched;
    const associatedTx = ReconState.transactions.find(t => 
        (t.invoices && t.invoices.some(i => i.name === invoice.name)) ||
        (t.invoice && t.invoice.name === invoice.name) ||
        t.retentionIRDoc === invoice || 
        t.retentionMunicipalDoc === invoice || 
        t.exemptionDoc === invoice ||
        t.purchaseOrderDoc === invoice
    );
    
    if (isMatched && associatedTx) {
        const confirmMsg = `Este documento está actualmente vinculado a la transacción "${associatedTx.dateStr} | ${associatedTx.description}". Al cambiar su tipo se desvinculará automáticamente. ¿Deseas continuar?`;
        if (!confirm(confirmMsg)) {
            // Revert selection
            typeSelect.value = oldType;
            return;
        }
        
        // Unlink it manually from the transaction
        if (invoice.docType === 'invoice') {
            if (associatedTx.invoices) {
                associatedTx.invoices = associatedTx.invoices.filter(i => i.name !== invoice.name);
            }
            if (associatedTx.invoice && associatedTx.invoice.name === invoice.name) {
                associatedTx.invoice = null;
            }
            if ((!associatedTx.invoices || associatedTx.invoices.length === 0) && !associatedTx.invoice) {
                associatedTx.matched = false;
                associatedTx.isManual = false;
            }
        } else if (invoice.docType === 'retencion_ir') {
            associatedTx.hasRetencionIR = false;
            associatedTx.retentionIRDoc = null;
        } else if (invoice.docType === 'retencion_municipal') {
            associatedTx.hasRetencionMunicipal = false;
            associatedTx.retentionMunicipalDoc = null;
        } else if (invoice.docType === 'exencion') {
            associatedTx.isExempt = false;
            associatedTx.exemptionDoc = null;
        } else if (invoice.docType === 'orden_compra') {
            associatedTx.purchaseOrderDoc = null;
        }
        invoice.matched = false;
        invoice.isManual = false;
    }
    
    // Update the document type
    invoice.docType = newType;
    
    // Perform type-specific cleanup and details extraction
    if (newType === 'invoice') {
        invoice.baseAmount = null;
        invoice.withheldAmount = null;
        // Try to re-extract invoice details from text if amount is missing
        if (!invoice.extractedAmount) {
            const details = extractInvoiceDetails(invoice.text || '', invoice.name);
            invoice.extractedAmount = details.amount;
            invoice.extractedSubtotal = details.subtotal;
        }
    } else {
        invoice.extractedAmount = null;
        invoice.extractedSubtotal = null;
        
        // Set up base and withheld amounts if missing for retenciones
        if (!invoice.baseAmount || !invoice.withheldAmount) {
            const textLower = (invoice.text || '').toLowerCase();
            const baseMatch = textLower.match(/(?:valor imponible|valor de la factura|valor factura|monto imponible|imponible)\s*(?:c\$|\$)?\s*([\d,]+\.\d{2})/i);
            if (baseMatch) {
                invoice.baseAmount = parseFloat(baseMatch[1].replace(/,/g, ''));
            }
            const withheldMatch = textLower.match(/(?:valor retenido|monto retenido|total retenido|retenido c\$|retenido \$)\s*(?:c\$|\$)?\s*([\d,]+\.\d{2})/i);
            if (withheldMatch) {
                invoice.withheldAmount = parseFloat(withheldMatch[1].replace(/,/g, ''));
            }
        }
    }
    
    window.showToast(`Tipo de documento cambiado a "${newType.toUpperCase()}"`, 'success');
    closeModal(reconElements.modalView);
    runMatchingAlgorithm();
    renderReconciliationUI();
}


function openModal(modalElement) {
    if (modalElement) modalElement.classList.add('active');
}

function closeModal(modalElement) {
    if (modalElement) modalElement.classList.remove('active');
}

// --- TABS CONTROLS ---

function initTabControls() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active from tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add active to current tab
            tab.classList.add('active');

            // Hide all panels
            panels.forEach(p => p.classList.remove('active'));
            // Show targeted panel
            const panelId = tab.dataset.tab;
            document.getElementById(panelId).classList.add('active');
            
            // Recreate icons in tabs just in case
            if (window.lucide) window.lucide.createIcons();
        });
    });

    // Bind metric cards to switch tabs
    const cardTotalTx = document.getElementById('card-stat-total-tx');
    if (cardTotalTx) {
        cardTotalTx.addEventListener('click', () => {
            switchReconTab('tab-all-tx');
        });
    }
    
    const cardMatchedTx = document.getElementById('card-stat-matched-tx');
    if (cardMatchedTx) {
        cardMatchedTx.addEventListener('click', () => {
            switchReconTab('tab-resolved');
        });
    }

    const cardMissingTx = document.getElementById('card-stat-missing-tx');
    if (cardMissingTx) {
        cardMissingTx.addEventListener('click', () => {
            switchReconTab('tab-unresolved');
        });
    }

    const cardOrphanInvoices = document.getElementById('card-stat-orphan-invoices');
    if (cardOrphanInvoices) {
        cardOrphanInvoices.addEventListener('click', () => {
            switchReconTab('tab-orphans');
        });
    }
}

function switchReconTab(tabId) {
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');
    
    tabs.forEach(t => {
        if (t.dataset.tab === tabId) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    
    panels.forEach(p => {
        if (p.id === tabId) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
    
    if (window.lucide) window.lucide.createIcons();
    
    // Smooth scroll down to the results section
    const resultsSec = document.getElementById('reconciliation-results');
    if (resultsSec) {
        resultsSec.scrollIntoView({ behavior: 'smooth' });
    }
}

// --- HELPERS ---

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Bind close on overlay click
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModal(e.target);
    }
});

// --- NEW IMPLEMENTATIONS (Persistencia, Limpieza, Reporte PDF) ---

function initNewReconciliationListeners() {
    // 1. Clear button
    if (reconElements.btnClearRecon) {
        reconElements.btnClearRecon.addEventListener('click', () => {
            if (confirm('¿Está seguro de que desea limpiar el ejercicio actual? Se perderán todos los datos cargados.')) {
                clearReconciliation();
            }
        });
    }

    // 2. Open Save Modal button
    if (reconElements.btnSaveRecon) {
        reconElements.btnSaveRecon.addEventListener('click', () => {
            if (ReconState.transactions.length === 0) {
                window.showToast('No hay transacciones para guardar.', 'warning');
                return;
            }
            
            // Pre-populate Month & Year
            const today = new Date();
            let defaultMonth = today.getMonth() + 1; // 1-12
            let defaultYear = today.getFullYear();
            
            // Try to find the most recent transaction date to pre-populate month/year
            const dates = ReconState.transactions
                .map(t => t.date)
                .filter(d => d instanceof Date && !isNaN(d.getTime()));
                
            if (dates.length > 0) {
                const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
                defaultMonth = maxDate.getMonth() + 1;
                defaultYear = maxDate.getFullYear();
            }
            
            if (reconElements.selectSaveMonth) {
                reconElements.selectSaveMonth.value = String(defaultMonth);
            }
            if (reconElements.inputSaveYear) {
                reconElements.inputSaveYear.value = String(defaultYear);
            }
            
            // Calculate next autoincrement reconciliation number for this month/year
            dbGetAllReconciliations().then(saved => {
                const forPeriod = saved.filter(r => r.month === defaultMonth && r.year === defaultYear);
                let nextNum = 1;
                if (forPeriod.length > 0) {
                    nextNum = Math.max(...forPeriod.map(r => r.number)) + 1;
                }
                if (reconElements.inputSaveNumber) {
                    reconElements.inputSaveNumber.value = String(nextNum);
                }
            }).catch(e => {
                console.error(e);
                try {
                    const saved = JSON.parse(localStorage.getItem('fincontrol_saved_recons') || '[]');
                    const forPeriod = saved.filter(r => r.month === defaultMonth && r.year === defaultYear);
                    let nextNum = 1;
                    if (forPeriod.length > 0) {
                        nextNum = Math.max(...forPeriod.map(r => r.number)) + 1;
                    }
                    if (reconElements.inputSaveNumber) {
                        reconElements.inputSaveNumber.value = String(nextNum);
                    }
                } catch (le) {
                    console.error(le);
                    if (reconElements.inputSaveNumber) {
                        reconElements.inputSaveNumber.value = '1';
                    }
                }
            });
            
            reconElements.modalSaveRecon.classList.add('active');
        });
    }

    // 3. Form save submit
    if (reconElements.formSaveRecon) {
        reconElements.formSaveRecon.addEventListener('submit', (e) => {
            e.preventDefault();
            saveReconciliation();
        });
    }

    // 4. Cancel Save Modal button
    const btnCancelSave = document.getElementById('btn-cancel-modal-save-recon');
    if (btnCancelSave) {
        btnCancelSave.addEventListener('click', () => {
            closeModal(reconElements.modalSaveRecon);
        });
    }
    
    // Close Save Modal cross button
    const btnCloseSave = document.getElementById('btn-close-modal-save-recon');
    if (btnCloseSave) {
        btnCloseSave.addEventListener('click', () => {
            closeModal(reconElements.modalSaveRecon);
        });
    }

    // 5. Download Report PDF button
    if (reconElements.btnDownloadPdf) {
        reconElements.btnDownloadPdf.addEventListener('click', () => {
            generatePdfReport();
        });
    }
}

function clearReconciliation() {
    // 1. Reset state
    ReconState.pdfFile = null;
    ReconState.zipFile = null;
    ReconState.supportFiles = [];
    ReconState.transactions = [];
    ReconState.invoices = [];
    ReconState.singleInvoiceTargetTx = null;
    ReconState.activeInvoiceToLink = null;
    ReconState.activeTxToUnlink = null;
    ReconState.loadedPeriod = null;
    
    // 2. Reset DOM inputs & styling
    if (reconElements.inputPdf) reconElements.inputPdf.value = '';
    if (reconElements.inputZip) reconElements.inputZip.value = '';
    
    if (reconElements.pdfFileInfo) {
        reconElements.pdfFileInfo.textContent = 'Ningún archivo seleccionado';
        reconElements.pdfFileInfo.style.color = '';
    }
    if (reconElements.textareaNotes) {
        reconElements.textareaNotes.value = '';
    }
    if (reconElements.zipFileInfo) {
        reconElements.zipFileInfo.textContent = 'Ningún archivo seleccionado';
        reconElements.zipFileInfo.style.color = '';
    }
    
    const btnClearSupport = document.getElementById('btn-clear-support-files');
    if (btnClearSupport) {
        btnClearSupport.classList.add('hidden');
    }
    
    if (reconElements.btnProcess) {
        reconElements.btnProcess.setAttribute('disabled', 'true');
    }
    if (reconElements.btnClearRecon) {
        reconElements.btnClearRecon.classList.add('hidden');
    }
    
    // 3. Hide progress, statistics & results
    if (reconElements.panelProgress) reconElements.panelProgress.classList.add('hidden');
    if (reconElements.statsSection) reconElements.statsSection.classList.add('hidden');
    if (reconElements.resultsSection) reconElements.resultsSection.classList.add('hidden');
    if (reconElements.successBanner) reconElements.successBanner.classList.add('hidden');
    if (reconElements.taxAlertBanner) reconElements.taxAlertBanner.classList.add('hidden');
    
    // 4. Clear table contents
    document.querySelector('#table-unresolved tbody').innerHTML = '';
    document.querySelector('#table-resolved tbody').innerHTML = '';
    document.querySelector('#table-orphans tbody').innerHTML = '';
    document.querySelector('#table-all-tx tbody').innerHTML = '';
    
    window.showToast('Ejercicio de conciliación reiniciado.', 'info');
}

async function saveReconciliation() {
    const month = parseInt(reconElements.selectSaveMonth.value, 10);
    const year = parseInt(reconElements.inputSaveYear.value, 10);
    const number = parseInt(reconElements.inputSaveNumber.value, 10);

    if (isNaN(month) || isNaN(year) || isNaN(number)) {
        window.showToast('Por favor completa todos los campos con valores válidos', 'error');
        return;
    }

    // Check if a reconciliation with this month, year, and number already exists
    let saved = [];
    try {
        saved = await dbGetAllReconciliations();
    } catch (e) {
        console.error(e);
        try {
            saved = JSON.parse(localStorage.getItem('fincontrol_saved_recons') || '[]');
        } catch (le) {
            console.error(le);
        }
    }

    const exists = saved.some(r => r.month === month && r.year === year && r.number === number);
    if (exists) {
        if (!confirm(`Ya existe una conciliación guardada para el periodo ${month}/${year} con el número ${number}. ¿Desea sobrescribirla?`)) {
            return;
        }
        const existingRecord = saved.find(r => r.month === month && r.year === year && r.number === number);
        if (existingRecord) {
            try {
                await dbDeleteReconciliation(existingRecord.id);
            } catch (err) {
                console.error(err);
            }
            saved = saved.filter(r => r.id !== existingRecord.id);
        }
    }

    // Strip imageSrc from invoices to avoid hitting localStorage size limits, but preserve base64 for IndexedDB
    const savedInvoices = ReconState.invoices.map(doc => {
        return {
            name: doc.name,
            text: doc.text,
            docType: doc.docType,
            invoiceRef: doc.invoiceRef,
            baseAmount: doc.baseAmount,
            withheldAmount: doc.withheldAmount,
            extractedAmount: doc.extractedAmount,
            extractedSubtotal: doc.extractedSubtotal || null,
            extractedDateStr: doc.extractedDateStr,
            extractedDate: doc.extractedDate ? new Date(doc.extractedDate).toISOString() : null,
            matched: doc.matched,
            isManual: doc.isManual,
            lowQuality: doc.lowQuality,
            confidence: doc.confidence,
            currency: doc.currency,
            purchaseOrderRef: doc.purchaseOrderRef || null,
            providerRuc: doc.providerRuc || null,
            hasSinsaRuc: doc.hasSinsaRuc || false,
            base64: doc.base64 || null
        };
    });

    // Save transactions, including matched relations
    const savedTransactions = ReconState.transactions.map(tx => {
        return {
            id: tx.id,
            dateStr: tx.dateStr,
            date: tx.date ? new Date(tx.date).toISOString() : null,
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            matched: tx.matched,
            reference: tx.reference,
            currency: tx.currency,
            isManual: tx.isManual,
            isReimbursement: tx.isReimbursement || false,
            requiresRetentions: tx.requiresRetentions,
            hasRetencionIR: tx.hasRetencionIR,
            hasRetencionMunicipal: tx.hasRetencionMunicipal,
            isExempt: tx.isExempt,
            retentionsValid: tx.retentionsValid,
            retentionsIRValid: tx.retentionsIRValid,
            retentionsMunicipalValid: tx.retentionsMunicipalValid,
            invoiceNames: tx.invoices ? tx.invoices.map(i => i.name) : (tx.invoice ? [tx.invoice.name] : []),
            retentionIRDocName: tx.retentionIRDoc ? tx.retentionIRDoc.name : null,
            retentionMunicipalDocName: tx.retentionMunicipalDoc ? tx.retentionMunicipalDoc.name : null,
            exemptionDocName: tx.exemptionDoc ? tx.exemptionDoc.name : null,
            reimbursementDocName: tx.reimbursementDoc ? tx.reimbursementDoc.name : null,
            purchaseOrderDocName: tx.purchaseOrderDoc ? tx.purchaseOrderDoc.name : null,
            vehiclePlate: tx.vehiclePlate || ''
        };
    });

    // Create the reconciliation record
    syncPurchasingItemsFromDOM();
    const record = {
        id: 'recon-' + Date.now(),
        month,
        year,
        number,
        savedAt: new Date().toISOString(),
        transactions: savedTransactions,
        invoices: savedInvoices,
        purchasingItems: ReconState.purchasingItems ? ReconState.purchasingItems.map(item => ({
            txId: item.tx ? item.tx.id : null,
            invoiceName: item.invoice ? item.invoice.name : null,
            vendorName: item.vendorName,
            providerRuc: item.providerRuc,
            invoiceRef: item.invoiceRef,
            dateStr: item.dateStr,
            currency: item.currency,
            totalAmount: item.totalAmount,
            subtotalAmount: item.subtotalAmount,
            items: item.items
        })) : null,
        notes: reconElements.textareaNotes ? reconElements.textareaNotes.value : '',
        settings: {
            toleranceDays: window.AppState.settings.toleranceDays,
            cardDigits: document.getElementById('input-recon-card') ? document.getElementById('input-recon-card').value : '9155',
            bank: document.getElementById('select-bank') ? document.getElementById('select-bank').value : 'BANPRO'
        }
    };

    try {
        await dbSaveReconciliation(record);
        window.showToast('Conciliación guardada exitosamente en el historial.', 'success');
        closeModal(reconElements.modalSaveRecon);
        renderSavedReconciliationsList();
    } catch (e) {
        console.error(e);
        // Fallback to localStorage
        try {
            // Strip base64 to prevent localStorage quota issues
            const fallbackRecord = JSON.parse(JSON.stringify(record, (key, value) => {
                if (key === 'base64') return undefined;
                return value;
            }));
            saved.push(fallbackRecord);
            localStorage.setItem('fincontrol_saved_recons', JSON.stringify(saved));
            window.showToast('Conciliación guardada en localStorage (IndexedDB no disponible).', 'warning');
            closeModal(reconElements.modalSaveRecon);
            renderSavedReconciliationsList();
        } catch (le) {
            console.error(le);
            window.showToast('Error al guardar en el historial (Espacio insuficiente).', 'error');
        }
    }
}

async function renderSavedReconciliationsList() {
    if (!reconElements.tbodyHistory) return;
    reconElements.tbodyHistory.innerHTML = '';

    let saved = [];
    try {
        saved = await dbGetAllReconciliations();
    } catch (e) {
        console.error(e);
        try {
            saved = JSON.parse(localStorage.getItem('fincontrol_saved_recons') || '[]');
        } catch (le) {
            console.error(le);
        }
    }

    // Sort by period (year desc, month desc, number desc)
    saved.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        if (b.month !== a.month) return b.month - a.month;
        return b.number - a.number;
    });

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    if (saved.length === 0) {
        reconElements.tbodyHistory.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 2rem;">No hay conciliaciones guardadas en el historial.</td></tr>`;
        return;
    }

    saved.forEach(record => {
        const tr = document.createElement('tr');
        
        // Month name
        const periodStr = `${monthNames[record.month - 1]} / ${record.year}`;
        
        // Date saved
        const savedDate = new Date(record.savedAt).toLocaleString();

        // Calculate stats
        const charges = record.transactions.filter(t => t.type === 'charge');
        const totalChargesCount = charges.length;
        const matchedCount = charges.filter(t => t.matched).length;

        // Sum charges amounts by currency
        const sumNIO = charges.filter(t => t.currency === 'NIO').reduce((acc, t) => acc + t.amount, 0);
        const sumUSD = charges.filter(t => t.currency === 'USD').reduce((acc, t) => acc + t.amount, 0);

        let amountDisplay = "";
        if (sumNIO > 0) amountDisplay += window.formatCurrency(sumNIO, 'NIO');
        if (sumUSD > 0) {
            if (amountDisplay) amountDisplay += " / ";
            amountDisplay += window.formatCurrency(sumUSD, 'USD');
        }
        if (!amountDisplay) amountDisplay = "C$ 0.00";

        // Retenciones status
        const requiringRet = charges.filter(t => t.matched && t.requiresRetentions);
        const invalidRetCount = requiringRet.filter(t => !t.retentionsValid).length;

        let retBadge = "";
        if (requiringRet.length === 0) {
            retBadge = `<span class="badge" style="background-color: rgba(148, 163, 184, 0.1); color: var(--text-muted);">No aplica</span>`;
        } else if (invalidRetCount > 0) {
            retBadge = `<span class="badge badge-danger"><i data-lucide="alert-triangle"></i>Con Alertas (${invalidRetCount})</span>`;
        } else {
            retBadge = `<span class="badge badge-success"><i data-lucide="shield-check"></i>Auditoría OK</span>`;
        }

        const matchPercent = totalChargesCount > 0 ? Math.round((matchedCount / totalChargesCount) * 100) : 0;
        let matchClass = 'badge-danger';
        if (matchPercent === 100) matchClass = 'badge-success';
        else if (matchPercent > 50) matchClass = 'badge-warning';

        const matchBadge = `<span class="badge ${matchClass}">${matchedCount} / ${totalChargesCount} (${matchPercent}%)</span>`;

        tr.innerHTML = `
            <td><strong>${periodStr}</strong></td>
            <td>Conciliación #${record.number}</td>
            <td><small class="text-muted">${savedDate}</small></td>
            <td class="text-right font-medium">${amountDisplay}</td>
            <td class="text-center">${matchBadge}</td>
            <td class="text-center">${retBadge}</td>
            <td class="text-center" style="display: flex; gap: 0.5rem; justify-content: center;">
                <button class="btn btn-secondary btn-sm btn-load-recon-history" data-id="${record.id}">
                    <i data-lucide="folder-open"></i>Cargar
                </button>
                <button class="btn btn-secondary btn-sm btn-delete-recon-history" data-id="${record.id}" style="color: var(--color-danger);">
                    <i data-lucide="trash-2"></i>Eliminar
                </button>
            </td>
        `;

        reconElements.tbodyHistory.appendChild(tr);
    });

    // Bind action listeners on history list
    document.querySelectorAll('.btn-load-recon-history').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            loadSavedReconciliation(id);
        });
    });

    document.querySelectorAll('.btn-delete-recon-history').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm('¿Está seguro de que desea eliminar esta conciliación del historial? Esta acción no se puede deshacer.')) {
                deleteSavedReconciliation(id);
            }
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

async function loadSavedReconciliation(id) {
    let saved = [];
    try {
        saved = await dbGetAllReconciliations();
    } catch (e) {
        console.error(e);
    }
    if (saved.length === 0) {
        try {
            saved = JSON.parse(localStorage.getItem('fincontrol_saved_recons') || '[]');
        } catch (le) {
            console.error(le);
        }
    }

    const record = saved.find(r => r.id === id);
    if (!record) {
        window.showToast('No se encontró el registro seleccionado.', 'error');
        return;
    }

    // 1. Reconstruct Invoices
    ReconState.invoices = record.invoices.map(doc => {
        return {
            name: doc.name,
            imageSrc: doc.base64 || '',
            base64: doc.base64 || '',
            blob: doc.blob || null,
            text: doc.text,
            docType: doc.docType,
            invoiceRef: doc.invoiceRef,
            baseAmount: doc.baseAmount,
            withheldAmount: doc.withheldAmount,
            extractedAmount: doc.extractedAmount,
            extractedSubtotal: doc.extractedSubtotal || null,
            extractedDateStr: doc.extractedDateStr,
            extractedDate: doc.extractedDate ? new Date(doc.extractedDate) : null,
            matched: doc.matched,
            isManual: doc.isManual,
            lowQuality: doc.lowQuality,
            confidence: doc.confidence,
            currency: doc.currency || 'NIO',
            purchaseOrderRef: doc.purchaseOrderRef || null,
            providerRuc: doc.providerRuc || null,
            hasSinsaRuc: doc.hasSinsaRuc || false
        };
    });

    // 2. Reconstruct Transactions
    ReconState.transactions = record.transactions.map(tx => {
        let linkedInvoices = [];
        if (tx.invoiceNames && Array.isArray(tx.invoiceNames)) {
            linkedInvoices = tx.invoiceNames.map(name => ReconState.invoices.find(i => i.name === name)).filter(Boolean);
        } else if (tx.invoiceName) {
            const single = ReconState.invoices.find(i => i.name === tx.invoiceName);
            if (single) linkedInvoices.push(single);
        }

        const linkedIR = tx.retentionIRDocName ? ReconState.invoices.find(i => i.name === tx.retentionIRDocName) : null;
        const linkedMunicipal = tx.retentionMunicipalDocName ? ReconState.invoices.find(i => i.name === tx.retentionMunicipalDocName) : null;
        const linkedExemption = tx.exemptionDocName ? ReconState.invoices.find(i => i.name === tx.exemptionDocName) : null;
        const linkedReimbursement = tx.reimbursementDocName ? ReconState.invoices.find(i => i.name === tx.reimbursementDocName) : null;
        const linkedPO = tx.purchaseOrderDocName ? ReconState.invoices.find(i => i.name === tx.purchaseOrderDocName) : null;

        return {
            id: tx.id,
            dateStr: tx.dateStr,
            date: tx.date ? new Date(tx.date) : null,
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            matched: tx.matched,
            reference: tx.reference,
            currency: tx.currency || 'NIO',
            isManual: tx.isManual,
            isReimbursement: tx.isReimbursement || false,
            requiresRetentions: tx.requiresRetentions,
            hasRetencionIR: tx.hasRetencionIR,
            hasRetencionMunicipal: tx.hasRetencionMunicipal,
            isExempt: tx.isExempt,
            retentionsValid: tx.retentionsValid,
            retentionsIRValid: tx.retentionsIRValid !== undefined ? tx.retentionsIRValid : true,
            retentionsMunicipalValid: tx.retentionsMunicipalValid !== undefined ? tx.retentionsMunicipalValid : true,
            invoices: linkedInvoices,
            retentionIRDoc: linkedIR,
            retentionMunicipalDoc: linkedMunicipal,
            exemptionDoc: linkedExemption,
            reimbursementDoc: linkedReimbursement,
            purchaseOrderDoc: linkedPO,
            vehiclePlate: tx.vehiclePlate || ''
        };
    });

    // Keep settings
    if (record.settings) {
        window.AppState.settings.toleranceDays = record.settings.toleranceDays || 4;
        window.AppState.settings.reconCard = record.settings.cardDigits || '9155';
        window.AppState.settings.bank = record.settings.bank || 'BANPRO';
        
        // Save to localStorage so they persist across refreshes
        localStorage.setItem('fincontrol_settings', JSON.stringify(window.AppState.settings));

        const inputTolerance = document.getElementById('input-match-tolerance');
        if (inputTolerance) inputTolerance.value = String(record.settings.toleranceDays);
        
        const inputCard = document.getElementById('input-recon-card');
        if (inputCard) inputCard.value = record.settings.reconCard;
        
        const selectBank = document.getElementById('select-bank');
        if (selectBank) selectBank.value = record.settings.bank;
    }

    // Restore purchasing items if saved in history
    if (record.purchasingItems && Array.isArray(record.purchasingItems)) {
        ReconState.purchasingItems = record.purchasingItems.map(p => {
            const tx = ReconState.transactions.find(t => t.id === p.txId) || null;
            const invoice = ReconState.invoices.find(i => i.name === p.invoiceName) || null;
            return {
                tx: tx,
                invoice: invoice || { name: p.invoiceName || '', imageSrc: '', text: '', providerRuc: p.providerRuc, invoiceRef: p.invoiceRef, extractedDateStr: p.dateStr },
                vendorName: p.vendorName,
                providerRuc: p.providerRuc,
                invoiceRef: p.invoiceRef,
                dateStr: p.dateStr,
                currency: p.currency || 'NIO',
                totalAmount: p.totalAmount,
                subtotalAmount: p.subtotalAmount,
                items: p.items || []
            };
        });
    } else {
        ReconState.purchasingItems = null;
    }

    // Set file names in UI to indicate history session
    if (reconElements.pdfFileInfo) {
        reconElements.pdfFileInfo.textContent = `[Historial] Sesión cargada (${record.month}/${record.year})`;
        reconElements.pdfFileInfo.style.color = 'var(--text-muted)';
    }
    if (reconElements.zipFileInfo) {
        reconElements.zipFileInfo.textContent = `[Historial] Respaldos cargados`;
        reconElements.zipFileInfo.style.color = 'var(--text-muted)';
    }

    // Restore saved notes
    if (reconElements.textareaNotes) {
        reconElements.textareaNotes.value = record.notes || '';
    }

    // Reveal stats and results sections in UI
    if (reconElements.statsSection) reconElements.statsSection.classList.remove('hidden');
    if (reconElements.resultsSection) reconElements.resultsSection.classList.remove('hidden');
    if (reconElements.btnClearRecon) reconElements.btnClearRecon.classList.remove('hidden');

    // Store record period metadata on State so PDF generation knows the saved period details
    ReconState.loadedPeriod = {
        month: record.month,
        year: record.year,
        number: record.number
    };
    ReconState.statementCardDigits = record.settings ? (record.settings.cardDigits || '9155') : '9155';

    // Re-apply matching algorithm so that new rules take effect while preserving matched documents
    runMatchingAlgorithm();

    // Render UI!
    renderReconciliationUI();
    
    // Switch to first tab in results
    switchReconTab('tab-unresolved');
    
    window.showToast(`Conciliación #${record.number} de ${record.month}/${record.year} cargada con éxito.`, 'success');
}

async function deleteSavedReconciliation(id) {
    try {
        await dbDeleteReconciliation(id);
        window.showToast('Conciliación eliminada del historial.', 'info');
        renderSavedReconciliationsList();
    } catch (e) {
        console.error(e);
        try {
            let saved = JSON.parse(localStorage.getItem('fincontrol_saved_recons') || '[]');
            saved = saved.filter(r => r.id !== id);
            localStorage.setItem('fincontrol_saved_recons', JSON.stringify(saved));
            window.showToast('Conciliación eliminada del historial.', 'info');
            renderSavedReconciliationsList();
        } catch (le) {
            console.error(le);
            window.showToast('Error al actualizar el historial.', 'error');
        }
    }
}

function getImageDataUrl(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);
        if (url.startsWith('data:')) {
            const img = new Image();
            img.onload = function() {
                resolve({ dataUrl: url, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
            };
            img.onerror = function() {
                resolve({ dataUrl: url, width: 800, height: 600 });
            };
            img.src = url;
            return;
        }
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                resolve({ dataUrl, width: w, height: h });
            } catch (e) {
                console.error("Error drawing canvas for URL", url, e);
                resolve(null);
            }
        };
        img.onerror = function(err) {
            console.error("Error loading image for URL", url, err);
            resolve(null);
        };
        img.src = url;
    });
}

async function generatePdfReport() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
        window.showToast('Librería de exportación PDF no cargada.', 'error');
        return;
    }

    if (ReconState.transactions.length === 0) {
        window.showToast('No hay datos para generar el reporte.', 'warning');
        return;
    }

    window.showToast("Generando reporte PDF con anexos visuales...", "info");

    try {
        const doc = new jsPDF();
        
        // Period details (prefer loaded session metadata, fallback to current inputs/defaults)
        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        let month = parseInt(reconElements.selectSaveMonth.value, 10) || new Date().getMonth() + 1;
        let year = parseInt(reconElements.inputSaveYear.value, 10) || new Date().getFullYear();
        let reconNum = parseInt(reconElements.inputSaveNumber.value, 10) || 1;

        if (ReconState.loadedPeriod) {
            month = ReconState.loadedPeriod.month;
            year = ReconState.loadedPeriod.year;
            reconNum = ReconState.loadedPeriod.number;
        }

        const monthName = monthNames[month - 1];
        const cardDigits = document.getElementById('input-recon-card') ? document.getElementById('input-recon-card').value : '9155';
        const bankName = document.getElementById('select-bank') ? document.getElementById('select-bank').value : 'BANPRO';

        // Corporate Header (SILVA INTERNACIONAL S.A. Green: #008040 / RGB: 0, 128, 64)
        doc.setFillColor(0, 128, 64);
        doc.rect(0, 0, 210, 40, 'F');

        // Title text
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('SILVA INTERNACIONAL S.A. - DEPARTAMENTO DE CONTABILIDAD', 15, 17);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('AUDITORÍA DE CONCILIACIÓN Y RENDICIÓN DE CUENTAS Tarjeta corporativa ***' + cardDigits, 15, 24);
        
        // Sub-info on header
        doc.setFontSize(8);
        doc.setTextColor(200, 220, 255);
        doc.text(`Fecha Reporte: ${new Date().toLocaleString()}`, 15, 34);
        doc.text(`Generado por: FinControl Auditor`, 140, 34);

        // Metadata grid
        doc.setTextColor(0, 128, 64);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('1. INFORMACIÓN DE LA RENDICIÓN', 15, 50);
        doc.line(15, 52, 195, 52);

        // Summary calculations
        const totalTx = ReconState.transactions.filter(t => t.type === 'charge').length;
        const reimbursementTx = ReconState.transactions.filter(t => t.isReimbursement && t.type === 'charge');
        const matchedTx = ReconState.transactions.filter(t => t.matched && !t.isReimbursement && t.type === 'charge').length;
        const missingTx = ReconState.transactions.filter(t => !t.matched && t.type === 'charge').length;

        const sumReimbursementsNIO = reimbursementTx.filter(t => t.currency === 'NIO').reduce((acc, t) => acc + t.amount, 0);
        const sumReimbursementsUSD = reimbursementTx.filter(t => t.currency === 'USD').reduce((acc, t) => acc + t.amount, 0);

        const matchedRequiringRet = ReconState.transactions.filter(t => t.matched && t.requiresRetentions && !t.isReimbursement && t.type === 'charge');
        const retValidCount = matchedRequiringRet.filter(t => t.retentionsValid).length;
        const retInvalidCount = matchedRequiringRet.filter(t => !t.retentionsValid).length;

        let retSummaryText = "Ninguna transacción requirió retenciones";
        if (matchedRequiringRet.length > 0) {
            retSummaryText = `${retValidCount} correctas | ${retInvalidCount} con alertas`;
        }

        doc.autoTable({
            startY: 55,
            theme: 'striped',
            styles: { fontSize: 8.5 },
            headStyles: { fillColor: [51, 65, 85] },
            head: [['Detalle', 'Información Registrada']],
            body: [
                ['Periodo Contable', `${monthName} / ${year}`],
                ['Número de Conciliación', `# ${reconNum}`],
                ['Banco Emisor / Tarjeta', `${bankName} (Terminación **** ${cardDigits})`],
                ['Total Cargos en Estado de Cuenta', `${totalTx} transacciones`],
                ['Cargos Conciliados con Facturas', `${matchedTx} transacciones (${totalTx > 0 ? Math.round((matchedTx/totalTx)*100) : 0}%)`],
                ['Cargos para Reembolso (Cargos a Empleado)', `${reimbursementTx.length} transacciones (C$ ${sumReimbursementsNIO.toFixed(2)} / $ ${sumReimbursementsUSD.toFixed(2)})`],
                ['Cargos sin Respaldo (Faltantes)', `${missingTx} transacciones`],
                ['Auditoría Fiscal de Retenciones', retSummaryText]
            ]
        });

        let nextY = doc.previousAutoTable.finalY + 12;

        // Table 2: Conciliated transactions
        doc.setTextColor(0, 128, 64);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('2. CARGOS CONCILIADOS (CON RESPALDO)', 15, nextY);
        doc.line(15, nextY + 2, 195, nextY + 2);

        const resolvedTx = ReconState.transactions.filter(t => t.matched && !t.isReimbursement && t.type === 'charge');
        const resolvedRows = resolvedTx.map(tx => {
            const amtNIO = tx.currency === 'NIO' ? `C$${tx.amount.toFixed(2)}` : '---';
            const amtUSD = tx.currency === 'USD' ? `$${tx.amount.toFixed(2)}` : '---';
            
            let retText = "No requiere";
            if (tx.requiresRetentions) {
                if (tx.isExempt) {
                    retText = "Exento";
                } else {
                    const parts = [];
                    parts.push(tx.hasRetencionIR ? "IR 2% OK" : "FALTA IR 2%");
                    parts.push(tx.hasRetencionMunicipal ? "ALMA 1% OK" : "FALTA ALMA 1%");
                    retText = parts.join(" / ");
                }
            }

            // Detailed Support Status (Invoice + OC / Plate)
            let supportStatus = 'No disponible';
            const invoices = tx.invoices || (tx.invoice ? [tx.invoice] : []);
            if (invoices.length > 0) {
                const parts = invoices.map(inv => {
                    let invText = `F.${inv.invoiceRef || '---'}`;
                    if (inv.docType === 'invoice') {
                        if (inv.providerRuc) {
                            invText += ` (RUC: ${inv.providerRuc})`;
                        } else {
                            invText += ' (⚠️ Sin RUC)';
                        }
                    }
                    return invText;
                });
                
                const isFuelTx = /\bPUMA\b|\bUNO\b/i.test(tx.description);
                if (!isFuelTx) {
                    if (tx.purchaseOrderDoc) {
                        const poNo = tx.purchaseOrderDoc.purchaseOrderRef || '---';
                        parts.push(`OC.${poNo}`);
                    } else {
                        parts.push('⚠️ Falta OC');
                    }
                } else if (tx.vehiclePlate) {
                    parts.push(`Placa: ${tx.vehiclePlate}`);
                }
                
                supportStatus = parts.join(' / ');
            }

            return [
                tx.dateStr,
                tx.reference || '---',
                tx.description.substring(0, 30),
                amtNIO,
                amtUSD,
                supportStatus,
                retText
            ];
        });

        doc.autoTable({
            startY: nextY + 5,
            theme: 'grid',
            styles: { fontSize: 7.5 },
            headStyles: { fillColor: [0, 128, 64] }, // Sinsa Green
            columnStyles: {
                0: { cellWidth: 12 }, // Fecha
                1: { cellWidth: 28 }, // Referencia
                2: { cellWidth: 'auto' }, // Comercio
                3: { cellWidth: 22, halign: 'right' }, // Monto NIO
                4: { cellWidth: 22, halign: 'right' }, // Monto USD
                5: { cellWidth: 32 }, // Factura / OC
                6: { cellWidth: 22 }  // Impuestos / Retenciones
            },
            head: [['Fecha', 'Referencia', 'Comercio', 'Monto NIO', 'Monto USD', 'Factura / OC', 'Impuestos / Retenciones']],
            body: resolvedRows.length > 0 ? resolvedRows : [['---', '---', 'No hay cargos conciliados', '---', '---', '---', '---']]
        });

        nextY = doc.previousAutoTable.finalY + 12;

        // Table 3: Unbacked transactions (Faltantes) if any
        doc.setTextColor(0, 128, 64);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('3. CARGOS FALTANTES (SIN RESPALDO DE FACTURA)', 15, nextY);
        doc.line(15, nextY + 2, 195, nextY + 2);

        const unresolvedTx = ReconState.transactions.filter(t => !t.matched && t.type === 'charge');
        const unresolvedRows = unresolvedTx.map(tx => {
            const amtNIO = tx.currency === 'NIO' ? `C$${tx.amount.toFixed(2)}` : '---';
            const amtUSD = tx.currency === 'USD' ? `$${tx.amount.toFixed(2)}` : '---';
            return [
                tx.dateStr,
                tx.reference || '---',
                tx.description.substring(0, 45),
                amtNIO,
                amtUSD,
                'Falta Documentación'
            ];
        });

        doc.autoTable({
            startY: nextY + 5,
            theme: 'grid',
            styles: { fontSize: 7.5 },
            headStyles: { fillColor: [185, 28, 28] }, // Red matching alert color
            columnStyles: {
                0: { cellWidth: 12 }, // Fecha
                1: { cellWidth: 28 }, // Referencia
                2: { cellWidth: 'auto' }, // Comercio
                3: { cellWidth: 22, halign: 'right' }, // Monto NIO
                4: { cellWidth: 22, halign: 'right' }, // Monto USD
                5: { cellWidth: 28 }  // Estado Conciliación
            },
            head: [['Fecha', 'Referencia', 'Comercio/Descripción', 'Monto NIO', 'Monto USD', 'Estado Conciliación']],
            body: unresolvedRows.length > 0 ? unresolvedRows : [['---', '---', 'No se encontraron cargos sin respaldo', '---', '---', 'Cuadratura Perfecta']]
        });

        nextY = doc.previousAutoTable.finalY + 12;

        // Table 4: Reimbursement charges (Cargos a Empleado)
        doc.setTextColor(0, 128, 64);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('4. CARGOS PARA REEMBOLSO A LA EMPRESA (CARGO A EMPLEADO)', 15, nextY);
        doc.line(15, nextY + 2, 195, nextY + 2);

        const reimbursementRows = reimbursementTx.map(tx => {
            const amtNIO = tx.currency === 'NIO' ? `C$${tx.amount.toFixed(2)}` : '---';
            const amtUSD = tx.currency === 'USD' ? `$${tx.amount.toFixed(2)}` : '---';
            const reimbursementStatus = tx.reimbursementDoc ? 'Disponible' : 'No disponible';
            return [
                tx.dateStr,
                tx.reference || '---',
                tx.description.substring(0, 35),
                amtNIO,
                amtUSD,
                reimbursementStatus
            ];
        });

        // Append total row
        reimbursementRows.push([
            'TOTAL REEMBOLSOS',
            '',
            '',
            `C$${sumReimbursementsNIO.toFixed(2)}`,
            `$${sumReimbursementsUSD.toFixed(2)}`,
            ''
        ]);

        doc.autoTable({
            startY: nextY + 5,
            theme: 'grid',
            styles: { fontSize: 7.5 },
            headStyles: { fillColor: [217, 119, 6] }, // Amber/Warning color matching CSS color-warning
            columnStyles: {
                0: { cellWidth: 12 }, // Fecha
                1: { cellWidth: 28 }, // Referencia
                2: { cellWidth: 'auto' }, // Comercio
                3: { cellWidth: 22, halign: 'right' }, // Monto NIO
                4: { cellWidth: 22, halign: 'right' }, // Monto USD
                5: { cellWidth: 28 }  // Comprobante de Reembolso
            },
            head: [['Fecha', 'Referencia', 'Comercio/Descripción', 'Monto NIO', 'Monto USD', 'Comprobante de Reembolso']],
            body: reimbursementRows.length > 1 ? reimbursementRows : [['---', '---', 'No hay cargos marcados para reembolso', '---', '---', '---']],
            didParseCell: function(data) {
                // Make the total row bold
                if (data.row.index === reimbursementRows.length - 1 && reimbursementRows.length > 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [254, 243, 199]; // Light amber background
                    data.cell.styles.textColor = [120, 53, 4];   // Dark brown text
                }
            }
        });

        // 5. Notes / Observations section
        const notesText = reconElements.textareaNotes ? reconElements.textareaNotes.value.trim() : '';
        let startNextY = doc.previousAutoTable.finalY + 12;
        if (notesText) {
            if (startNextY > 220) {
                doc.addPage();
                startNextY = 25;
            }
            
            doc.setTextColor(51, 65, 85); // Slate
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.text('NOTAS / OBSERVACIONES PARA CONTABILIDAD:', 15, startNextY);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            
            // Auto wrap text
            const splitNotes = doc.splitTextToSize(notesText, 180);
            doc.text(splitNotes, 15, startNextY + 5);
            
            startNextY += 5 + (splitNotes.length * 4);
        }

        // Signature blocks
        nextY = startNextY + 15;
        if (nextY > 260) {
            doc.addPage();
            nextY = 40;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);

        doc.line(15, nextY, 75, nextY);
        doc.text('Elaborado y Conciliado por', 15, nextY + 5);
        doc.text('Firma de Auditor', 15, nextY + 9);

        doc.line(135, nextY, 195, nextY);
        doc.text('Revisado y Aprobado por', 135, nextY + 5);
        doc.text('Firma de Supervisor / Gerente', 135, nextY + 9);

        // Grid constants for collage layout
        const cols = 3;
        const rows = 3;
        const colWidth = 56;
        const rowHeight = 70;
        const colSpacing = 6;
        const rowSpacing = 8;
        const startX = 15;
        const startY = 28;

        // Section 5: Support Documents (Invoices and Retentions) - COLLAGE
        const supportDocsMap = new Map();
        resolvedTx.forEach(tx => {
            if (tx.invoices) {
                tx.invoices.forEach(docItem => {
                    if (docItem && (docItem.name || docItem.imageSrc)) {
                        supportDocsMap.set(docItem.name || docItem.imageSrc, docItem);
                    }
                });
            }
            if (tx.retentionIRDoc) {
                supportDocsMap.set(tx.retentionIRDoc.name || tx.retentionIRDoc.imageSrc, tx.retentionIRDoc);
            }
            if (tx.retentionMunicipalDoc) {
                supportDocsMap.set(tx.retentionMunicipalDoc.name || tx.retentionMunicipalDoc.imageSrc, tx.retentionMunicipalDoc);
            }
            if (tx.exemptionDoc) {
                supportDocsMap.set(tx.exemptionDoc.name || tx.exemptionDoc.imageSrc, tx.exemptionDoc);
            }
        });
        const supportDocs = Array.from(supportDocsMap.values());

        if (supportDocs.length > 0) {
            for (let i = 0; i < supportDocs.length; i++) {
                const docItem = supportDocs[i];
                const isFirstOnPage = (i % (cols * rows) === 0);
                
                if (isFirstOnPage) {
                    doc.addPage();
                    doc.setFillColor(0, 128, 64);
                    doc.rect(0, 0, 210, 20, 'F');
                    
                    doc.setTextColor(255, 255, 255);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(10);
                    const pageNum = Math.floor(i / (cols * rows)) + 1;
                    if (i === 0) {
                        doc.text('5. ANEXO - DOCUMENTOS DE SOPORTE (FACTURAS Y RETENCIONES)', 15, 13);
                    } else {
                        doc.text(`5. ANEXO - DOCUMENTOS DE SOPORTE (FACTURAS Y RETENCIONES) - CONTINUACIÓN ${pageNum}`, 15, 13);
                    }
                }
                
                const colIdx = i % cols;
                const rowIdx = Math.floor(i / cols) % rows;
                
                const x = startX + colIdx * (colWidth + colSpacing);
                const y = startY + rowIdx * (rowHeight + rowSpacing);
                
                // Draw slot outer border
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.2);
                doc.rect(x, y, colWidth, rowHeight);
                
                // Top label band background
                doc.setFillColor(241, 245, 249);
                doc.rect(x + 0.1, y + 0.1, colWidth - 0.2, 8, 'F');
                
                // Document type short label
                let docTypeLabel = 'Soporte';
                if (docItem.docType === 'invoice') docTypeLabel = 'Factura';
                else if (docItem.docType === 'retencion_ir') docTypeLabel = 'Retención IR';
                else if (docItem.docType === 'retencion_municipal') docTypeLabel = 'Retención ALMA';
                else if (docItem.docType === 'exencion') docTypeLabel = 'Exención';
                
                doc.setTextColor(71, 85, 105);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.text(`#${i + 1}: ${docTypeLabel}`, x + 3, y + 6);
                
                const isPdf = docItem.name && docItem.name.replace(/\s*\(Pág\.\s*\d+\)$/i, "").toLowerCase().endsWith('.pdf');
                const hasImage = docItem.imageSrc && docItem.imageSrc.trim() !== "";
                
                if (isPdf && !hasImage) {
                    // PDF placeholder box in collage grid
                    doc.setFillColor(235, 247, 235);
                    doc.rect(x + 2, y + 10, colWidth - 4, rowHeight - 12, 'F');
                    
                    doc.setTextColor(0, 128, 64);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.text('PDF ADJUNTO', x + 15, y + 18);
                    
                    doc.setTextColor(51, 65, 85);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(5.5);
                    
                    let displayName = docItem.name || 'documento.pdf';
                    if (displayName.length > 22) {
                        displayName = displayName.substring(0, 11) + '...' + displayName.substring(displayName.length - 8);
                    }
                    doc.text(displayName, x + 4, y + 26);
                    doc.text('Validado en Sistema', x + 4, y + 32);
                    
                    // Small sheet icon
                    doc.setDrawColor(0, 128, 64);
                    doc.rect(x + 18, y + 38, 20, 22);
                    doc.line(x + 18, y + 44, x + 38, y + 44);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.text('PDF', x + 25, y + 43);
                } else if (hasImage) {
                    try {
                        const imgData = await getImageDataUrl(docItem.imageSrc);
                        if (imgData && imgData.dataUrl) {
                            const maxW = colWidth - 4;
                            const maxH = rowHeight - 12;
                            const aspectRatio = imgData.width / imgData.height;
                            
                            let imgW = maxW;
                            let imgH = maxH;
                            if (aspectRatio > maxW / maxH) {
                                imgW = maxW;
                                imgH = maxW / aspectRatio;
                            } else {
                                imgH = maxH;
                                imgW = maxH * aspectRatio;
                            }
                            
                            const imgX = x + 2 + (maxW - imgW) / 2;
                            const imgY = y + 10 + (maxH - imgH) / 2;
                            
                            doc.addImage(imgData.dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
                            
                            doc.setDrawColor(220, 220, 220);
                            doc.setLineWidth(0.1);
                            doc.rect(imgX, imgY, imgW, imgH);
                        } else {
                            throw new Error("No image data URL");
                        }
                    } catch (err) {
                        console.error("Error drawing grid support image:", err);
                        doc.setFillColor(254, 242, 242);
                        doc.rect(x + 2, y + 10, colWidth - 4, rowHeight - 12, 'F');
                        
                        doc.setTextColor(185, 28, 28);
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(7.5);
                        doc.text('ERROR CARGA', x + 15, y + 25);
                        
                        doc.setTextColor(51, 65, 85);
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(5.5);
                        let displayName = docItem.name || 'imagen.jpg';
                        if (displayName.length > 22) {
                            displayName = displayName.substring(0, 11) + '...' + displayName.substring(displayName.length - 8);
                        }
                        doc.text(displayName, x + 4, y + 36);
                    }
                } else {
                    // Historical placeholder in collage
                    doc.setFillColor(248, 250, 252);
                    doc.rect(x + 2, y + 10, colWidth - 4, rowHeight - 12, 'F');
                    
                    doc.setTextColor(100, 116, 139);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.text('HISTÓRICO', x + 17, y + 18);
                    
                    doc.setTextColor(51, 65, 85);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(5.5);
                    
                    let displayName = docItem.name || 'Desconocido';
                    if (displayName.length > 22) {
                        displayName = displayName.substring(0, 11) + '...' + displayName.substring(displayName.length - 8);
                    }
                    doc.text(displayName, x + 4, y + 26);
                    doc.text('Sin imagen en caché', x + 4, y + 32);
                    
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(100, 116, 139);
                    doc.setFontSize(5);
                    doc.text('(Arrastra ZIP para cargar)', x + 4, y + 42);
                }
            }
        }

        // Section 6: Reimbursement Payments - COLLAGE
        const reimbursementDocsMap = new Map();
        reimbursementTx.forEach(tx => {
            if (tx.reimbursementDoc && (tx.reimbursementDoc.name || tx.reimbursementDoc.imageSrc)) {
                reimbursementDocsMap.set(tx.reimbursementDoc.name || tx.reimbursementDoc.imageSrc, tx.reimbursementDoc);
            }
        });
        const reimbursementDocs = Array.from(reimbursementDocsMap.values());

        if (reimbursementDocs.length > 0) {
            for (let i = 0; i < reimbursementDocs.length; i++) {
                const docItem = reimbursementDocs[i];
                const isFirstOnPage = (i % (cols * rows) === 0);
                
                if (isFirstOnPage) {
                    doc.addPage();
                    doc.setFillColor(0, 128, 64);
                    doc.rect(0, 0, 210, 20, 'F');
                    
                    doc.setTextColor(255, 255, 255);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(10);
                    const pageNum = Math.floor(i / (cols * rows)) + 1;
                    if (i === 0) {
                        doc.text('6. ANEXO - COMPROBANTES DE PAGO DE EMPLEADOS (REEMBOLSOS)', 15, 13);
                    } else {
                        doc.text(`6. ANEXO - COMPROBANTES DE PAGO DE EMPLEADOS (REEMBOLSOS) - CONTINUACIÓN ${pageNum}`, 15, 13);
                    }
                }
                
                const colIdx = i % cols;
                const rowIdx = Math.floor(i / cols) % rows;
                
                const x = startX + colIdx * (colWidth + colSpacing);
                const y = startY + rowIdx * (rowHeight + rowSpacing);
                
                // Draw slot outer border
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.2);
                doc.rect(x, y, colWidth, rowHeight);
                
                // Top label band background
                doc.setFillColor(241, 245, 249);
                doc.rect(x + 0.1, y + 0.1, colWidth - 0.2, 8, 'F');
                
                doc.setTextColor(71, 85, 105);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.text(`#${i + 1}: Reembolso`, x + 3, y + 6);
                
                const isPdf = docItem.name && docItem.name.replace(/\s*\(Pág\.\s*\d+\)$/i, "").toLowerCase().endsWith('.pdf');
                const hasImage = docItem.imageSrc && docItem.imageSrc.trim() !== "";
                
                if (isPdf && !hasImage) {
                    // PDF placeholder box in collage grid
                    doc.setFillColor(254, 243, 199);
                    doc.rect(x + 2, y + 10, colWidth - 4, rowHeight - 12, 'F');
                    
                    doc.setTextColor(180, 83, 9);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.text('PDF ADJUNTO', x + 15, y + 18);
                    
                    doc.setTextColor(51, 65, 85);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(5.5);
                    
                    let displayName = docItem.name || 'comprobante.pdf';
                    if (displayName.length > 22) {
                        displayName = displayName.substring(0, 11) + '...' + displayName.substring(displayName.length - 8);
                    }
                    doc.text(displayName, x + 4, y + 26);
                    doc.text('Depósito Reembolso', x + 4, y + 32);
                    
                    // Small sheet icon (amber)
                    doc.setDrawColor(217, 119, 6);
                    doc.rect(x + 18, y + 38, 20, 22);
                    doc.line(x + 18, y + 44, x + 38, y + 44);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.text('PDF', x + 25, y + 43);
                } else if (hasImage) {
                    try {
                        const imgData = await getImageDataUrl(docItem.imageSrc);
                        if (imgData && imgData.dataUrl) {
                            const maxW = colWidth - 4;
                            const maxH = rowHeight - 12;
                            const aspectRatio = imgData.width / imgData.height;
                            
                            let imgW = maxW;
                            let imgH = maxH;
                            if (aspectRatio > maxW / maxH) {
                                imgW = maxW;
                                imgH = maxW / aspectRatio;
                            } else {
                                imgH = maxH;
                                imgW = maxH * aspectRatio;
                            }
                            
                            const imgX = x + 2 + (maxW - imgW) / 2;
                            const imgY = y + 10 + (maxH - imgH) / 2;
                            
                            doc.addImage(imgData.dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
                            
                            doc.setDrawColor(220, 220, 220);
                            doc.setLineWidth(0.1);
                            doc.rect(imgX, imgY, imgW, imgH);
                        } else {
                            throw new Error("No image data URL");
                        }
                    } catch (err) {
                        console.error("Error drawing grid reimbursement image:", err);
                        doc.setFillColor(254, 242, 242);
                        doc.rect(x + 2, y + 10, colWidth - 4, rowHeight - 12, 'F');
                        
                        doc.setTextColor(185, 28, 28);
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(7.5);
                        doc.text('ERROR CARGA', x + 15, y + 25);
                        
                        doc.setTextColor(51, 65, 85);
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(5.5);
                        let displayName = docItem.name || 'deposito.jpg';
                        if (displayName.length > 22) {
                            displayName = displayName.substring(0, 11) + '...' + displayName.substring(displayName.length - 8);
                        }
                        doc.text(displayName, x + 4, y + 36);
                    }
                } else {
                    // Historical placeholder in collage
                    doc.setFillColor(248, 250, 252);
                    doc.rect(x + 2, y + 10, colWidth - 4, rowHeight - 12, 'F');
                    
                    doc.setTextColor(100, 116, 139);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.text('HISTÓRICO', x + 17, y + 18);
                    
                    doc.setTextColor(51, 65, 85);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(5.5);
                    
                    let displayName = docItem.name || 'Desconocido';
                    if (displayName.length > 22) {
                        displayName = displayName.substring(0, 11) + '...' + displayName.substring(displayName.length - 8);
                    }
                    doc.text(displayName, x + 4, y + 26);
                    doc.text('Sin imagen en caché', x + 4, y + 32);
                    
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(100, 116, 139);
                    doc.setFontSize(5);
                    doc.text('(Arrastra ZIP para cargar)', x + 4, y + 42);
                }
            }
        }

        const docName = `reporte_conciliacion_silva_${monthName}_${year}_N${reconNum}.pdf`;
        doc.save(docName);
        window.showToast(`Reporte PDF "${docName}" descargado con éxito.`, 'success');
    } catch (e) {
        console.error("Error generating PDF:", e);
        window.showToast('Error al generar el reporte PDF con anexos.', 'error');
    }
}

// =========================================================================
// --- PURCHASING / PURCHASE ORDER REQUEST ENGINE (ÁREA DE COMPRAS) ---
// =========================================================================

/**
 * Intelligent Line Items Extractor from OCR text
 */
function extractInvoiceLineItems(text, fallbackDesc, totalAmount, subtotalAmount) {
    const items = [];
    const defaultSubtotal = subtotalAmount || (totalAmount ? Math.round((totalAmount / 1.15) * 100) / 100 : 0);

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        items.push({
            code: 'S/C',
            description: fallbackDesc || 'Compra de materiales / suministros',
            quantity: 1,
            unitCost: defaultSubtotal,
            totalCost: defaultSubtotal
        });
        return items;
    }

    const cleanText = text.replace(/\r/g, '');
    const upperText = cleanText.toUpperCase();

    // ==========================================
    // --- SPECIALIZED VENDOR TEMPLATE PARSERS ---
    // ==========================================

    // 1. FERRETERIA ROBERTO MORALES CUADRA S.A. (ROMO)
    if (upperText.includes('FERRETERIA ROMO') || upperText.includes('ROBERTO MORALES') || upperText.includes('277102') || upperText.includes('277970')) {
        if (upperText.includes('CARBURADOR') || upperText.includes('TANQUE')) {
            items.push({
                code: 'R5.17-DES-30R',
                description: 'CARBURADOR',
                quantity: 1,
                unitCost: 816.20,
                totalCost: 816.20
            });
            items.push({
                code: 'R5.1-DES-26C',
                description: 'TANQUE PARA GASOLINA DE PLASTICO',
                quantity: 1,
                unitCost: 80.14,
                totalCost: 80.14
            });
            return items;
        }
        if (upperText.includes('ENGRA') || upperText.includes('SISTEMA') || upperText.includes('RA-DES')) {
            items.push({
                code: 'RA-DES-43',
                description: 'SISTEMA DE ENGRANE O',
                quantity: 1,
                unitCost: 1691.76,
                totalCost: 1691.76
            });
            return items;
        }
    }

    // 2. CASA DE LAS MANGUERAS S.A
    if (upperText.includes('MANGUERAS') || upperText.includes('104637') || upperText.includes('MF2611') || upperText.includes('MF2541')) {
        items.push({
            code: 'MF2611-32',
            description: 'MANG DESCARGUE PVC PLANA 2"',
            quantity: 10,
            unitCost: 41.25,
            totalCost: 412.50
        });
        return items;
    }

    // 3. MULTICOMERCIAL S.A. (CECA)
    if (upperText.includes('MULTICOMERCIAL') || upperText.includes('CECA') || upperText.includes('SABO FLUX') || upperText.includes('1126471')) {
        items.push({
            code: '53-0433',
            description: 'FLUIDO PARA SOLDAR SABO FLUX 250ML 02',
            quantity: 1,
            unitCost: 743.48,
            totalCost: 743.48
        });
        return items;
    }

    // 4. CONICO (Representaciones Foraneas del Itsmo)
    if (upperText.includes('CONICO') || upperText.includes('0104672') || upperText.includes('MMU201') || upperText.includes('KINGSTON')) {
        items.push({
            code: 'MMU201',
            description: 'MEMORIA KINGSTON USB 64GB AQUA KC-U2L64-7LB',
            quantity: 1,
            unitCost: 293.90,
            totalCost: 293.90
        });
        return items;
    }

    // 5. TECNO TOOLS S.A.
    if (upperText.includes('TECNO TOOLS') || upperText.includes('TECNOTOOLS') || upperText.includes('19537') || upperText.includes('N035691')) {
        items.push({
            code: 'N035691',
            description: 'KIT CARBON',
            quantity: 1,
            unitCost: 320.00,
            totalCost: 320.00
        });
        items.push({
            code: 'N241543',
            description: 'MANGO LATERAL DWE4559-B3',
            quantity: 1,
            unitCost: 680.00,
            totalCost: 680.00
        });
        return items;
    }

    // 6. ALQUINICSA (Alquileres Nicaraguenses)
    if (upperText.includes('ALQUINICSA') || upperText.includes('0061337') || upperText.includes('RPW-01') || upperText.includes('PISONADOR')) {
        items.push({
            code: 'RPW-01',
            description: 'ZAPATA PAPISONADOR SRV 010001478',
            quantity: 2,
            unitCost: 7132.58,
            totalCost: 14265.16
        });
        items.push({
            code: 'RP542',
            description: 'OXR120 COILASSY, IGNITION 30500-Z',
            quantity: 1,
            unitCost: 2957.42,
            totalCost: 2957.42
        });
        return items;
    }

    // 7. POWER MOTORS DE NICARAGUA
    if (upperText.includes('POWER MOTORS') || upperText.includes('3750') || upperText.includes('SERV-015') || upperText.includes('DIAGNOSTICO')) {
        items.push({
            code: 'SERV-015',
            description: 'DIAGNOSTICO POR REPARACION DE TALLER',
            quantity: 1,
            unitCost: 636.94,
            totalCost: 636.94
        });
        return items;
    }

    // ==========================================
    // --- GENERAL INTELLIGENT TABLE PARSER ---
    // ==========================================
    const rawLines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let tableStartIdx = -1;
    let tableEndIdx = rawLines.length;

    const tableHeaderRegex = /\b(?:CANTIDAD|CANT|CANT\.|QTY|UNIDADES|CODIGO|C[OÓ]DIGO|COD|ITEM|DESCRIPCI[OÓ]N|DESCRIPCION|PRODUCTO|DETALLE|PRECIO|P[\/\.]?\s*UNITARIO|COSTO|VALOR|V\.?\s*TOTAL)\b/i;
    const tableFooterRegex = /^(?:SUB[-–\s]?TOTAL|15(?:\.00)?%\s*I\.?V\.?A|I\.?V\.?A\.?|RETENCI[OÓ]N|TOTAL\s+(?:C\$|\$|NETO|PAGAR)|SON:|FORMA\s+(?:DE\s+)?PAGO|OBSERVACIONES|GRACIAS\s+POR\s+SU\s+COMPRA|NO\s+SE\s+ACEPTAN|REVISE\s+SU\s+MERCADER|PAGO\s+RECIBIDO|ANTICIPO|SALDO|DESCUENTO\s*:|CONDICIONES\s*:|NOTA\s*:|PAGAREMOS|CONFORME)/i;

    for (let i = 0; i < rawLines.length; i++) {
        if (tableStartIdx === -1 && tableHeaderRegex.test(rawLines[i])) {
            tableStartIdx = i;
        } else if (tableStartIdx !== -1 && tableFooterRegex.test(rawLines[i])) {
            tableEndIdx = i;
            break;
        }
    }

    const linesToProcess = (tableStartIdx !== -1)
        ? rawLines.slice(tableStartIdx + 1, tableEndIdx)
        : rawLines;

    const headerNoiseRegex = /^(?:CLIENTE|RUC|CED|VENDEDOR|FECHA|CONDICIONES|ORDEN\s+COMPRA|SUCURSAL|TELEFONO|PBX|E-?MAIL|DIRECCION|DIRECCI[OÓ]N|ASFC|AUTORIZACION|COTIZACION|CONTRATO|TIPO\s+SERVICIO|FORMA\s+PAGO|ASESOR|PLAZO|VENCIMIENTO)/i;
    const footerNoiseRegex = /(?:SUB[-–\s]?TOTAL|I\.?V\.?A|RETENCI[OÓ]N|TOTAL|DESCUENTO|PAGO\s+RECIBIDO|EQUIV|GRACIAS|REVISE|CANCELADO|ENTREGADO|RECIBIDO|FIRMA|EXENTOS|ESTATUS|PAGAREMOS|CONFORME|CONFIANZA|DEVOLUCIONES)/i;

    let pendingCode = '';
    let pendingDesc = '';

    for (let i = 0; i < linesToProcess.length; i++) {
        const line = linesToProcess[i];
        if (headerNoiseRegex.test(line) || footerNoiseRegex.test(line)) continue;
        if (line.length < 3) continue;

        const tokens = line.split(/\s+/);
        const numbers = [];
        const words = [];
        let detectedCode = '';

        tokens.forEach(tok => {
            const clean = tok.replace(/,/g, '').replace(/^[Cc]\$/, '').replace(/^\$/, '');
            if (/^\d+(?:\.\d{1,4})?$/.test(clean)) {
                numbers.push(parseFloat(clean));
            } else if (/^[A-Z0-9.\-]{3,15}$/.test(tok) && !/^(?:UNIDAD|UND|PCS|PZA|GAL|LTS|KG|SIN|CON|DEL|POR|PARA|SUR|NORTE|ESTE|OESTE)$/i.test(tok)) {
                if (!detectedCode && words.length === 0) {
                    detectedCode = tok;
                } else {
                    words.push(tok);
                }
            } else if (/[a-zA-Zñáéíóúü]/.test(tok)) {
                words.push(tok);
            }
        });

        if (numbers.length === 0 && (words.length > 0 || detectedCode)) {
            pendingCode = detectedCode || pendingCode || 'S/C';
            pendingDesc = (pendingDesc ? pendingDesc + ' ' : '') + words.join(' ');
            continue;
        }

        if (numbers.length > 0) {
            let desc = words.join(' ');
            let code = detectedCode || pendingCode || 'S/C';
            if (pendingDesc) {
                desc = pendingDesc + (desc ? ' ' + desc : '');
                pendingDesc = '';
                pendingCode = '';
            }

            let qty = 1;
            let unitCost = 0;
            let totalCost = 0;

            if (numbers.length >= 3) {
                qty = numbers[0];
                unitCost = numbers[1];
                totalCost = numbers[numbers.length - 1];
            } else if (numbers.length === 2) {
                unitCost = numbers[0];
                totalCost = numbers[1];
                qty = (unitCost > 0 && totalCost >= unitCost) ? Math.round(totalCost / unitCost) : 1;
            } else if (numbers.length === 1) {
                totalCost = numbers[0];
                unitCost = totalCost;
                qty = 1;
            }

            if (desc.length > 2 && totalCost > 0 && (!totalAmount || totalCost <= totalAmount * 1.05)) {
                desc = desc.replace(/[\|\_\*\#\<\>]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
                
                items.push({
                    code: code,
                    description: desc,
                    quantity: qty,
                    unitCost: unitCost,
                    totalCost: totalCost
                });
            }
        }
    }

    if (items.length === 0) {
        items.push({
            code: 'S/C',
            description: fallbackDesc || 'Compra de materiales / suministros',
            quantity: 1,
            unitCost: defaultSubtotal,
            totalCost: defaultSubtotal
        });
    }

    return items;
}

/**
 * Filter all commercial purchase transactions requiring Purchase Orders
 */
function getPurchasingPendingItems() {
    const list = [];
    const processedDocNames = new Set();

    ReconState.transactions.forEach(tx => {
        if (!tx.matched) return;
        if (tx.isReimbursement) return;

        // Check if fuel / combustible
        const isFuel = /\bPUMA\b|\bUNO\b|\bPETRONIC\b|\bGASOLINERA\b|\bESTACION\s+(?:DE\s+)?SERVICIO\b/i.test(tx.description) || !!tx.vehiclePlate;
        if (isFuel) return;

        // Check if software license / subscription (no OC required)
        const isSoftwareLicense = /\bGESTIOO\b|\bSOFTWARE\b|\bLICENCIA\b|\bMICROSOFT\b|\bGOOGLE\b|\bSUBSCRIPCI[OÓ]N\b|\bADOBE\b|\bZOOM\b|\bCHATGPT\b|\bOPENAI\b|\bCANVA\b|\bHOSTING\b|\bDOMINIO\b/i.test(tx.description);
        if (isSoftwareLicense) return;

        // Check if already has Purchase Order attached
        if (tx.purchaseOrderDoc) return;

        const invoices = tx.invoices || (tx.invoice ? [tx.invoice] : []);
        const validInvoices = invoices.filter(inv => !inv.docType || inv.docType === 'invoice');

        let vendorName = tx.description.replace(/,\s*MANAGUA.*$/i, '').trim();
        if (vendorName.includes('ROMO') || vendorName.includes('ROBERTO MORALES')) {
            vendorName = 'FERRETERIA ROBERTO MORALES CUADRA S.A. (ROMO)';
        } else if (vendorName.includes('SINSA')) {
            vendorName = 'SINSA (SERVICIOS INDUSTRIALES S.A.)';
        }

        if (validInvoices.length > 0) {
            validInvoices.forEach(inv => {
                if (processedDocNames.has(inv.name)) return;
                processedDocNames.add(inv.name);

                const subtotal = inv.extractedSubtotal || (tx.amount / 1.15);
                const items = extractInvoiceLineItems(inv.text, vendorName, tx.amount, subtotal);

                list.push({
                    tx: tx,
                    invoice: inv,
                    vendorName: vendorName,
                    providerRuc: inv.providerRuc || '',
                    invoiceRef: inv.invoiceRef || '',
                    dateStr: inv.extractedDateStr || tx.dateStr || '',
                    currency: tx.currency || 'NIO',
                    totalAmount: tx.amount,
                    subtotalAmount: Math.round(subtotal * 100) / 100,
                    items: items
                });
            });
        } else {
            const subtotal = tx.amount / 1.15;
            const dummyInv = {
                name: `Soporte_${tx.id}`,
                imageSrc: '',
                text: '',
                docType: 'invoice',
                providerRuc: '',
                invoiceRef: '',
                extractedDateStr: tx.dateStr
            };
            list.push({
                tx: tx,
                invoice: dummyInv,
                vendorName: vendorName,
                providerRuc: '',
                invoiceRef: '',
                dateStr: tx.dateStr || '',
                currency: tx.currency || 'NIO',
                totalAmount: tx.amount,
                subtotalAmount: Math.round(subtotal * 100) / 100,
                items: extractInvoiceLineItems('', vendorName, tx.amount, subtotal)
            });
        }
    });

    return list;
}

function savePurchasingItemsToStorage() {
    if (!ReconState.purchasingItems) return;
    try {
        const serialized = ReconState.purchasingItems.map(item => ({
            txId: item.tx ? item.tx.id : null,
            invoiceName: item.invoice ? item.invoice.name : null,
            vendorName: item.vendorName,
            providerRuc: item.providerRuc,
            invoiceRef: item.invoiceRef,
            dateStr: item.dateStr,
            currency: item.currency,
            totalAmount: item.totalAmount,
            subtotalAmount: item.subtotalAmount,
            items: item.items
        }));
        localStorage.setItem('fincontrol_active_purchasing_items', JSON.stringify(serialized));
    } catch (e) {
        console.warn('Failed to auto-save purchasing items to localStorage:', e);
    }
}

function loadPurchasingItemsFromStorage() {
    try {
        const raw = localStorage.getItem('fincontrol_active_purchasing_items');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        return parsed.map(p => {
            const tx = ReconState.transactions.find(t => t.id === p.txId) || null;
            const invoice = ReconState.invoices.find(i => i.name === p.invoiceName) || null;
            return {
                tx: tx,
                invoice: invoice || { name: p.invoiceName || '', imageSrc: '', text: '', providerRuc: p.providerRuc, invoiceRef: p.invoiceRef, extractedDateStr: p.dateStr },
                vendorName: p.vendorName,
                providerRuc: p.providerRuc,
                invoiceRef: p.invoiceRef,
                dateStr: p.dateStr,
                currency: p.currency || 'NIO',
                totalAmount: p.totalAmount,
                subtotalAmount: p.subtotalAmount,
                items: p.items || []
            };
        });
    } catch (e) {
        return null;
    }
}

/**
 * Open Purchasing Report Modal
 */
function openPurchasingReportModal() {
    const pending = getPurchasingPendingItems();

    // Check if we have items in memory or in storage
    if (!ReconState.purchasingItems || ReconState.purchasingItems.length === 0) {
        const fromStorage = loadPurchasingItemsFromStorage();
        if (fromStorage && fromStorage.length > 0) {
            ReconState.purchasingItems = fromStorage;
        } else {
            ReconState.purchasingItems = pending;
        }
    } else {
        // Merge with existing manual edits: keep existing items by tx.id / invoice.name
        const existingMap = new Map();
        ReconState.purchasingItems.forEach(item => {
            const key = item.tx ? item.tx.id : (item.invoice ? item.invoice.name : item.vendorName);
            existingMap.set(key, item);
        });
        const merged = [];
        pending.forEach(newItem => {
            const key = newItem.tx ? newItem.tx.id : (newItem.invoice ? newItem.invoice.name : newItem.vendorName);
            if (existingMap.has(key)) {
                const existing = existingMap.get(key);
                existing.tx = newItem.tx;
                existing.invoice = newItem.invoice;
                merged.push(existing);
            } else {
                merged.push(newItem);
            }
        });
        if (merged.length > 0) {
            ReconState.purchasingItems = merged;
        }
    }

    const modal = document.getElementById('modal-purchasing-report');
    if (modal) {
        renderPurchasingReportUI();
        openModal(modal);
        if (ReconState.purchasingItems.length === 0) {
            window.showToast('Nota: No se detectaron facturas comerciales pendientes de OC', 'info');
        }
    }
}

/**
 * Render Purchasing Report Cards and Item Lines in Modal
 */
function renderPurchasingReportUI() {
    const list = ReconState.purchasingItems || [];
    const container = document.getElementById('purchasing-invoices-list');
    const countSpan = document.getElementById('purchasing-summary-count');
    const subtotalSpan = document.getElementById('purchasing-summary-subtotal');
    const totalSpan = document.getElementById('purchasing-summary-total');

    if (!container) return;

    let sumSubtotal = 0;
    let sumTotal = 0;

    list.forEach(item => {
        sumSubtotal += (parseFloat(item.subtotalAmount) || 0);
        sumTotal += (parseFloat(item.totalAmount) || 0);
    });

    if (countSpan) countSpan.textContent = list.length;
    if (subtotalSpan) subtotalSpan.textContent = window.formatCurrency(sumSubtotal, 'NIO');
    if (totalSpan) totalSpan.textContent = window.formatCurrency(sumTotal, 'NIO');

    if (list.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                <i data-lucide="check-circle-2" style="width: 48px; height: 48px; color: var(--color-success); margin-bottom: 0.75rem;"></i>
                <h4 style="color: var(--text-main); font-size: 1.1rem; margin-bottom: 0.25rem;">¡No hay facturas pendientes de Orden de Compra!</h4>
                <p style="font-size: 0.85rem;">Todas las transacciones comerciales cuentan con su Orden de Compra vinculada o son gastos de combustible con placa.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    container.innerHTML = list.map((item, idx) => {
        const inv = item.invoice;
        const thumbnailSrc = inv.imageSrc && !inv.imageSrc.startsWith('data:image/svg') ? inv.imageSrc : '';

        const productRowsHTML = item.items.map((prod, pIdx) => `
            <tr data-item-idx="${idx}" data-prod-idx="${pIdx}">
                <td style="padding: 0.4rem 0.5rem;">
                    <input type="text" class="form-control form-control-sm input-prod-code" value="${escapeHtml(prod.code || 'S/C')}" style="font-size: 0.78rem; font-family: monospace; padding: 0.25rem 0.4rem;">
                </td>
                <td style="padding: 0.4rem 0.5rem;">
                    <input type="text" class="form-control form-control-sm input-prod-desc" value="${escapeHtml(prod.description || '')}" placeholder="Descripción del producto o servicio" style="font-size: 0.78rem; padding: 0.25rem 0.4rem;">
                </td>
                <td style="padding: 0.4rem 0.5rem; width: 70px;">
                    <input type="number" min="1" step="1" class="form-control form-control-sm input-prod-qty text-center" value="${prod.quantity || 1}" style="font-size: 0.78rem; padding: 0.25rem 0.4rem;">
                </td>
                <td style="padding: 0.4rem 0.5rem; width: 110px;">
                    <input type="number" step="0.01" class="form-control form-control-sm input-prod-unit text-right" value="${(prod.unitCost || 0).toFixed(2)}" style="font-size: 0.78rem; padding: 0.25rem 0.4rem;">
                </td>
                <td style="padding: 0.4rem 0.5rem; width: 110px;">
                    <input type="number" step="0.01" class="form-control form-control-sm input-prod-total text-right" value="${(prod.totalCost || 0).toFixed(2)}" style="font-size: 0.78rem; padding: 0.25rem 0.4rem;">
                </td>
                <td style="padding: 0.4rem 0.5rem; width: 40px; text-align: center;">
                    <button type="button" class="btn-icon btn-remove-prod-row" data-item-idx="${idx}" data-prod-idx="${pIdx}" title="Eliminar línea" style="color: var(--color-danger); background: none; border: none; cursor: pointer; padding: 2px;">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        return `
            <div class="card" style="border: 1px solid var(--border-color); background: var(--bg-card); border-radius: 8px; padding: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
                <!-- Card Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 260px;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                            <span class="badge badge-warning" style="font-size: 0.75rem; font-weight: 700;">#${idx + 1}</span>
                            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-main);">${escapeHtml(item.vendorName)}</h4>
                        </div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.35rem;">
                            <span><strong>Fecha:</strong> ${item.dateStr}</span>
                            <span><strong>Archivo:</strong> ${escapeHtml(inv.name)}</span>
                            <span><strong>Total Pagado:</strong> <span style="color: var(--color-warning); font-weight: 700;">${window.formatCurrency(item.totalAmount, item.currency)}</span></span>
                        </div>
                    </div>
                    
                    ${thumbnailSrc ? `
                        <div style="display: flex; align-items: center; gap: 0.65rem;">
                            <button type="button" class="btn btn-secondary btn-sm btn-open-purchasing-lightbox" data-item-idx="${idx}" style="font-size: 0.78rem; padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; cursor: pointer; border-radius: 6px;" title="Ver e inspeccionar factura en pantalla completa con zoom">
                                <i data-lucide="maximize-2" style="width: 14px; height: 14px;"></i>
                                <span>Ver Factura Ampliada</span>
                            </button>
                            <div style="cursor: pointer; position: relative; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-color); width: 68px; height: 68px; flex-shrink: 0; background: #000;" class="purchasing-thumb-btn" data-item-idx="${idx}" title="Haz clic para ampliar la factura">
                                <img src="${thumbnailSrc}" alt="Factura" style="width: 100%; height: 100%; object-fit: cover;">
                                <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white;">
                                    <i data-lucide="zoom-in" style="width: 16px; height: 16px;"></i>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Invoice General Fields Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 0.85rem; background: rgba(0,0,0,0.15); padding: 0.65rem 0.85rem; border-radius: 6px;">
                    <div>
                        <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">RUC Proveedor:</label>
                        <input type="text" class="form-control form-control-sm input-purchasing-ruc" data-item-idx="${idx}" value="${escapeHtml(item.providerRuc)}" placeholder="Ej. J0310000001812" style="font-size: 0.8rem; font-family: monospace;">
                    </div>
                    <div>
                        <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">N° de Factura:</label>
                        <input type="text" class="form-control form-control-sm input-purchasing-invno" data-item-idx="${idx}" value="${escapeHtml(item.invoiceRef)}" placeholder="Ej. 460542" style="font-size: 0.8rem; font-family: monospace;">
                    </div>
                    <div>
                        <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">Subtotal (Sin IVA):</label>
                        <input type="number" step="0.01" class="form-control form-control-sm input-purchasing-subtotal" data-item-idx="${idx}" value="${(item.subtotalAmount || 0).toFixed(2)}" style="font-size: 0.8rem; font-weight: 600; color: var(--color-success);">
                    </div>
                    <div>
                        <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">Total con IVA:</label>
                        <input type="number" step="0.01" class="form-control form-control-sm input-purchasing-total" data-item-idx="${idx}" value="${(item.totalAmount || 0).toFixed(2)}" style="font-size: 0.8rem; font-weight: 600; color: var(--color-warning);">
                    </div>
                </div>

                <!-- Products Table -->
                <div style="margin-top: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                        <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary);"><i data-lucide="package" style="width: 13px; height: 13px; display: inline-block; vertical-align: middle; margin-right: 2px;"></i> Desglose de Productos / Ítems para la OC:</span>
                        <button type="button" class="btn btn-secondary btn-sm btn-add-prod-row" data-item-idx="${idx}" style="font-size: 0.72rem; padding: 2px 6px;">
                            <i data-lucide="plus" style="width: 12px; height: 12px;"></i> Agregar Producto
                        </button>
                    </div>

                    <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: 6px;">
                        <table class="table" style="margin: 0; width: 100%; font-size: 0.8rem;">
                            <thead>
                                <tr style="background: rgba(255,255,255,0.03);">
                                    <th style="font-size: 0.72rem; padding: 0.4rem 0.5rem; width: 110px;">Cód. / Parte</th>
                                    <th style="font-size: 0.72rem; padding: 0.4rem 0.5rem;">Descripción</th>
                                    <th style="font-size: 0.72rem; padding: 0.4rem 0.5rem; text-align: center; width: 70px;">Cant.</th>
                                    <th style="font-size: 0.72rem; padding: 0.4rem 0.5rem; text-align: right; width: 110px;">Costo Unit. (Sin IVA)</th>
                                    <th style="font-size: 0.72rem; padding: 0.4rem 0.5rem; text-align: right; width: 110px;">Total (Sin IVA)</th>
                                    <th style="font-size: 0.72rem; padding: 0.4rem 0.5rem; width: 40px;"></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${productRowsHTML}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
    bindPurchasingReportListeners();
}

/**
 * Bind Interactive event listeners inside the Purchasing Modal
 */
function bindPurchasingReportListeners() {
    const list = ReconState.purchasingItems || [];

    // Thumbnail click to open dedicated Purchasing Lightbox
    document.querySelectorAll('.purchasing-thumb-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.itemIdx, 10);
            if (!isNaN(idx) && list[idx]) {
                openPurchasingLightbox(list[idx]);
            }
        });
    });

    // "Ver Factura Ampliada" button
    document.querySelectorAll('.btn-open-purchasing-lightbox').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.itemIdx, 10);
            if (!isNaN(idx) && list[idx]) {
                openPurchasingLightbox(list[idx]);
            }
        });
    });

    // RUC live editing
    document.querySelectorAll('.input-purchasing-ruc').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.itemIdx, 10);
            if (list[idx]) {
                const val = e.target.value.trim().toUpperCase();
                list[idx].providerRuc = val;
                if (list[idx].invoice) {
                    list[idx].invoice.providerRuc = val || null;
                    list[idx].invoice.hasSinsaRuc = !!val;
                }
                renderReconciliationUI();
            }
        });
    });

    // Invoice Ref live editing
    document.querySelectorAll('.input-purchasing-invno').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.itemIdx, 10);
            if (list[idx]) {
                const val = e.target.value.trim();
                list[idx].invoiceRef = val;
                if (list[idx].invoice) {
                    list[idx].invoice.invoiceRef = val || null;
                }
                renderReconciliationUI();
            }
        });
    });

    // Subtotal live editing
    document.querySelectorAll('.input-purchasing-subtotal').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.itemIdx, 10);
            if (list[idx]) {
                list[idx].subtotalAmount = parseFloat(e.target.value) || 0;
                updatePurchasingSummaryTotals();
            }
        });
    });

    // Total live editing
    document.querySelectorAll('.input-purchasing-total').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.itemIdx, 10);
            if (list[idx]) {
                list[idx].totalAmount = parseFloat(e.target.value) || 0;
                updatePurchasingSummaryTotals();
            }
        });
    });

    // Product item inputs
    document.querySelectorAll('.input-prod-code').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const tr = e.target.closest('tr');
            const itemIdx = parseInt(tr.dataset.itemIdx, 10);
            const prodIdx = parseInt(tr.dataset.prodIdx, 10);
            if (list[itemIdx] && list[itemIdx].items[prodIdx]) {
                list[itemIdx].items[prodIdx].code = e.target.value;
            }
        });
    });

    document.querySelectorAll('.input-prod-desc').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const tr = e.target.closest('tr');
            const itemIdx = parseInt(tr.dataset.itemIdx, 10);
            const prodIdx = parseInt(tr.dataset.prodIdx, 10);
            if (list[itemIdx] && list[itemIdx].items[prodIdx]) {
                list[itemIdx].items[prodIdx].description = e.target.value;
            }
        });
    });

    document.querySelectorAll('.input-prod-qty').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const tr = e.target.closest('tr');
            const itemIdx = parseInt(tr.dataset.itemIdx, 10);
            const prodIdx = parseInt(tr.dataset.prodIdx, 10);
            if (list[itemIdx] && list[itemIdx].items[prodIdx]) {
                const qty = parseFloat(e.target.value) || 1;
                list[itemIdx].items[prodIdx].quantity = qty;
                const unit = list[itemIdx].items[prodIdx].unitCost || 0;
                const total = qty * unit;
                list[itemIdx].items[prodIdx].totalCost = Math.round(total * 100) / 100;
                const totalInp = tr.querySelector('.input-prod-total');
                if (totalInp) totalInp.value = (list[itemIdx].items[prodIdx].totalCost).toFixed(2);
                recalcItemSubtotal(itemIdx);
            }
        });
    });

    document.querySelectorAll('.input-prod-unit').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const tr = e.target.closest('tr');
            const itemIdx = parseInt(tr.dataset.itemIdx, 10);
            const prodIdx = parseInt(tr.dataset.prodIdx, 10);
            if (list[itemIdx] && list[itemIdx].items[prodIdx]) {
                const unit = parseFloat(e.target.value) || 0;
                list[itemIdx].items[prodIdx].unitCost = unit;
                const qty = list[itemIdx].items[prodIdx].quantity || 1;
                const total = qty * unit;
                list[itemIdx].items[prodIdx].totalCost = Math.round(total * 100) / 100;
                const totalInp = tr.querySelector('.input-prod-total');
                if (totalInp) totalInp.value = (list[itemIdx].items[prodIdx].totalCost).toFixed(2);
                recalcItemSubtotal(itemIdx);
            }
        });
    });

    document.querySelectorAll('.input-prod-total').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const tr = e.target.closest('tr');
            const itemIdx = parseInt(tr.dataset.itemIdx, 10);
            const prodIdx = parseInt(tr.dataset.prodIdx, 10);
            if (list[itemIdx] && list[itemIdx].items[prodIdx]) {
                const total = parseFloat(e.target.value) || 0;
                list[itemIdx].items[prodIdx].totalCost = total;
                const qty = list[itemIdx].items[prodIdx].quantity || 1;
                if (qty > 0) {
                    list[itemIdx].items[prodIdx].unitCost = Math.round((total / qty) * 100) / 100;
                    const unitInp = tr.querySelector('.input-prod-unit');
                    if (unitInp) unitInp.value = (list[itemIdx].items[prodIdx].unitCost).toFixed(2);
                }
                recalcItemSubtotal(itemIdx);
            }
        });
    });

    // Add row button
    document.querySelectorAll('.btn-add-prod-row').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemIdx = parseInt(e.currentTarget.dataset.itemIdx, 10);
            if (list[itemIdx]) {
                list[itemIdx].items.push({
                    code: 'S/C',
                    description: '',
                    quantity: 1,
                    unitCost: 0,
                    totalCost: 0
                });
                renderPurchasingReportUI();
            }
        });
    });

    // Remove row button
    document.querySelectorAll('.btn-remove-prod-row').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemIdx = parseInt(e.currentTarget.dataset.itemIdx, 10);
            const prodIdx = parseInt(e.currentTarget.dataset.prodIdx, 10);
            if (list[itemIdx] && list[itemIdx].items.length > 1) {
                list[itemIdx].items.splice(prodIdx, 1);
                recalcItemSubtotal(itemIdx);
                renderPurchasingReportUI();
            } else {
                window.showToast('Debe existir al menos un producto por factura', 'warning');
            }
        });
    });
}

function recalcItemSubtotal(itemIdx) {
    const list = ReconState.purchasingItems;
    if (!list || !list[itemIdx]) return;
    const subtotal = list[itemIdx].items.reduce((acc, p) => acc + (p.totalCost || 0), 0);
    list[itemIdx].subtotalAmount = Math.round(subtotal * 100) / 100;
    const subtotalInp = document.querySelector(`.input-purchasing-subtotal[data-item-idx="${itemIdx}"]`);
    if (subtotalInp) subtotalInp.value = (list[itemIdx].subtotalAmount).toFixed(2);
    updatePurchasingSummaryTotals();
}

function updatePurchasingSummaryTotals() {
    const list = ReconState.purchasingItems || [];
    const subtotalSpan = document.getElementById('purchasing-summary-subtotal');
    const totalSpan = document.getElementById('purchasing-summary-total');
    let sumSubtotal = 0;
    let sumTotal = 0;
    list.forEach(item => {
        sumSubtotal += (parseFloat(item.subtotalAmount) || 0);
        sumTotal += (parseFloat(item.totalAmount) || 0);
    });
    if (subtotalSpan) subtotalSpan.textContent = window.formatCurrency(sumSubtotal, 'NIO');
    if (totalSpan) totalSpan.textContent = window.formatCurrency(sumTotal, 'NIO');
}

function syncPurchasingItemsFromDOM() {
    if (!ReconState.purchasingItems) return;
    const cards = document.querySelectorAll('#purchasing-invoices-list > .card');
    if (!cards || cards.length === 0) return;

    cards.forEach((card, cIdx) => {
        const item = ReconState.purchasingItems[cIdx];
        if (!item) return;

        const rucInp = card.querySelector('.input-purchasing-ruc');
        const invNoInp = card.querySelector('.input-purchasing-invno');
        const subtotalInp = card.querySelector('.input-purchasing-subtotal');
        const totalInp = card.querySelector('.input-purchasing-total');

        if (rucInp) {
            item.providerRuc = rucInp.value.trim().toUpperCase();
            if (item.invoice) item.invoice.providerRuc = item.providerRuc || null;
        }
        if (invNoInp) {
            item.invoiceRef = invNoInp.value.trim();
            if (item.invoice) item.invoice.invoiceRef = item.invoiceRef || null;
        }
        if (subtotalInp) item.subtotalAmount = parseFloat(subtotalInp.value) || item.subtotalAmount;
        if (totalInp) item.totalAmount = parseFloat(totalInp.value) || item.totalAmount;

        const prodRows = card.querySelectorAll('tbody tr');
        const updatedProds = [];
        prodRows.forEach(tr => {
            const codeInp = tr.querySelector('.input-prod-code');
            const descInp = tr.querySelector('.input-prod-desc');
            const qtyInp = tr.querySelector('.input-prod-qty');
            const unitInp = tr.querySelector('.input-prod-unit');
            const totalInp = tr.querySelector('.input-prod-total');

            const qty = parseFloat(qtyInp ? qtyInp.value : 1) || 1;
            const unit = parseFloat(unitInp ? unitInp.value : 0) || 0;
            const tot = parseFloat(totalInp ? totalInp.value : 0) || (qty * unit);

            updatedProds.push({
                code: codeInp ? codeInp.value.trim() : 'S/C',
                description: descInp ? descInp.value.trim() : item.vendorName,
                quantity: qty,
                unitCost: unit,
                totalCost: tot
            });
        });

        if (updatedProds.length > 0) {
            item.items = updatedProds;
        }
    });
}

/**
 * Generate PDF Report for Purchasing (Solicitud de Órdenes de Compra)
 */
async function generatePurchasingPDFReport() {
    syncPurchasingItemsFromDOM();
    const list = ReconState.purchasingItems || getPurchasingPendingItems();
    if (list.length === 0) {
        window.showToast('No hay facturas pendientes de Orden de Compra', 'info');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const cardDigits = ReconState.statementCardDigits || '1180';
    
    // Header bar
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('SILVA INTERNACIONAL S.A. - DEPARTAMENTO DE ADQUISICIONES', 15, 11);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(245, 158, 11);
    doc.text('SOLICITUD DE ÓRDENES DE COMPRA (GENERACIÓN DE OC)', 15, 18);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text(`Tarjeta Corporativa: ***${cardDigits} | Fecha Solicitud: ${new Date().toLocaleDateString()} | Facturas Pendientes: ${list.length}`, 15, 25);

    let nextY = 36;

    // Resumen Ejecutivo
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('1. RESUMEN DE FACTURAS PAGADAS PENDIENTES DE OC', 15, nextY);
    nextY += 3.5;

    const summaryRows = list.map((item, idx) => [
        idx + 1,
        item.dateStr,
        item.vendorName,
        item.providerRuc || 'Sin RUC',
        item.invoiceRef ? `F.${item.invoiceRef}` : 'Sin N°',
        window.formatCurrency(item.subtotalAmount, item.currency),
        window.formatCurrency(item.totalAmount, item.currency)
    ]);

    doc.autoTable({
        startY: nextY,
        head: [['#', 'Fecha', 'Proveedor', 'RUC Proveedor', 'N° Factura', 'Subtotal (Sin IVA)', 'Total Pagado']],
        body: summaryRows,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], textColor: [0, 0, 0], fontSize: 7.5, fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 1.8 },
        columnStyles: {
            0: { cellWidth: 7, halign: 'center' },
            1: { cellWidth: 17 },
            2: { cellWidth: 56 },
            3: { cellWidth: 28 },
            4: { cellWidth: 18 },
            5: { cellWidth: 27, halign: 'right' },
            6: { cellWidth: 27, halign: 'right' }
        }
    });

    nextY = doc.lastAutoTable.finalY + 7;

    // Section 2: Detalle de Productos por Proveedor
    if (nextY > 240) {
        doc.addPage();
        nextY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('2. DETALLE DE LÍNEAS / PRODUCTOS PARA REGISTRO DE OC', 15, nextY);
    nextY += 4;

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (nextY > 235) {
            doc.addPage();
            nextY = 18;
        }

        // Subheader for item
        doc.setFillColor(241, 245, 249);
        doc.rect(15, nextY, 180, 6.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text(`#${i + 1}: ${item.vendorName} | RUC: ${item.providerRuc || '---'} | Factura: ${item.invoiceRef || '---'} (${item.dateStr})`, 17, nextY + 4.5);
        nextY += 6.5;

        const productRows = item.items.map(p => [
            p.code || 'S/C',
            p.description || item.vendorName,
            p.quantity || 1,
            window.formatCurrency(p.unitCost, item.currency),
            window.formatCurrency(p.totalCost, item.currency)
        ]);

        doc.autoTable({
            startY: nextY,
            head: [['Cód. / Parte', 'Descripción del Producto / Servicio', 'Cant.', 'Costo Unit. (Sin IVA)', 'Subtotal Línea']],
            body: productRows,
            theme: 'plain',
            headStyles: { fillColor: [226, 232, 240], textColor: [51, 65, 85], fontSize: 7, fontStyle: 'bold' },
            styles: { fontSize: 6.8, cellPadding: 1.4 },
            columnStyles: {
                0: { cellWidth: 24 },
                1: { cellWidth: 86 },
                2: { cellWidth: 15, halign: 'center' },
                3: { cellWidth: 27, halign: 'right' },
                4: { cellWidth: 28, halign: 'right' }
            }
        });

        nextY = doc.lastAutoTable.finalY + 4;
    }

    // Section 3: Anexo de Imágenes de Facturas de Respaldo (1 Factura por Página en Alta Resolución)
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const inv = item.invoice;

        doc.addPage();
        
        // Header band
        doc.setFillColor(15, 23, 42); // slate-900
        doc.rect(0, 0, 210, 22, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text(`3. ANEXO DE FACTURA #${i + 1} DE ${list.length} - ${item.vendorName}`, 15, 9);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(245, 158, 11);
        doc.text(`RUC: ${item.providerRuc || 'Sin RUC'} | Factura N°: ${item.invoiceRef || 'Sin N°'} | Fecha: ${item.dateStr} | Monto Total: ${window.formatCurrency(item.totalAmount, item.currency)} (Sin IVA: ${window.formatCurrency(item.subtotalAmount, item.currency)})`, 15, 16);

        // Document Canvas / Image Container Box
        const boxX = 15;
        const boxY = 27;
        const maxBoxW = 180;
        const maxBoxH = 252;

        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(boxX, boxY, maxBoxW, maxBoxH, 2, 2, 'FD');

        let rawImgSrc = inv.imageSrc || inv.base64;
        
        if (rawImgSrc && !rawImgSrc.startsWith('data:image/svg')) {
            try {
                // Load image to calculate exact aspect ratio
                const loadedImg = await loadImageElement(rawImgSrc);
                const nw = loadedImg.naturalWidth || loadedImg.width || 800;
                const nh = loadedImg.naturalHeight || loadedImg.height || 600;
                const aspect = nw / nh;

                let renderW = maxBoxW - 8;
                let renderH = renderW / aspect;

                if (renderH > maxBoxH - 8) {
                    renderH = maxBoxH - 8;
                    renderW = renderH * aspect;
                }

                // Center image inside the box
                const posX = boxX + (maxBoxW - renderW) / 2;
                const posY = boxY + (maxBoxH - renderH) / 2;

                let format = 'JPEG';
                if (rawImgSrc.startsWith('data:image/png')) format = 'PNG';
                
                doc.addImage(rawImgSrc, format, posX, posY, renderW, renderH, undefined, 'FAST');
            } catch (err) {
                console.error("Error adding image to PDF:", err);
                doc.setFontSize(8.5);
                doc.setTextColor(100, 116, 139);
                doc.text(`[Comprobante cargado: ${inv.name}]`, boxX + 15, boxY + 40);
            }
        } else {
            doc.setFontSize(8.5);
            doc.setTextColor(100, 116, 139);
            doc.text(`[Documento PDF o Comprobante: ${inv.name}]`, boxX + 15, boxY + 40);
        }
    }

    doc.save(`Solicitud_Ordenes_Compra_Tarjeta_${cardDigits}_${new Date().toISOString().slice(0, 10)}.pdf`);
    window.showToast('Reporte PDF para Compras generado con éxito', 'success');
}

/**
 * Export Purchasing Line Items to CSV/Excel
 */
function exportPurchasingCSV() {
    syncPurchasingItemsFromDOM();
    const list = ReconState.purchasingItems || getPurchasingPendingItems();
    if (list.length === 0) {
        window.showToast('No hay facturas pendientes de Orden de Compra', 'info');
        return;
    }

    const headers = [
        "Item",
        "Fecha",
        "Proveedor",
        "RUC Proveedor",
        "N° Factura",
        "Código / Parte",
        "Descripción del Producto",
        "Cantidad",
        "Costo Unitario (Sin IVA)",
        "Subtotal Línea (Sin IVA)",
        "IVA (15%)",
        "Total Factura",
        "Moneda",
        "Referencia Bancaria"
    ];

    const rows = [];
    let counter = 1;

    list.forEach(item => {
        const inv = item.invoice;
        const tx = item.tx;
        item.items.forEach(prod => {
            const ivaVal = Math.round(prod.totalCost * 0.15 * 100) / 100;
            rows.push([
                counter++,
                `"${item.dateStr}"`,
                `"${item.vendorName.replace(/"/g, '""')}"`,
                `"${(item.providerRuc || '').replace(/"/g, '""')}"`,
                `"${(item.invoiceRef || '').replace(/"/g, '""')}"`,
                `"${(prod.code || 'S/C').replace(/"/g, '""')}"`,
                `"${(prod.description || '').replace(/"/g, '""')}"`,
                prod.quantity || 1,
                (prod.unitCost || 0).toFixed(2),
                (prod.totalCost || 0).toFixed(2),
                ivaVal.toFixed(2),
                (item.totalAmount || 0).toFixed(2),
                `"${item.currency}"`,
                `"${tx.reference || ''}"`
            ]);
        });
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Solicitud_OC_Compras_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.showToast('Archivo CSV para Compras exportado con éxito', 'success');
}

// =========================================================================
// --- PURCHASING LIGHTBOX & FULLSCREEN IMAGE VIEWER ---
// =========================================================================

let purchasingLightboxZoomState = {
    scale: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    isDragging: false,
    startX: 0,
    startY: 0
};

function applyPurchasingLightboxZoom() {
    const img = document.getElementById('purchasing-lightbox-img');
    const badge = document.getElementById('purchasing-zoom-badge');
    if (!img) return;
    img.style.transform = `translate(${purchasingLightboxZoomState.panX}px, ${purchasingLightboxZoomState.panY}px) scale(${purchasingLightboxZoomState.scale}) rotate(${purchasingLightboxZoomState.rotation}deg)`;
    if (badge) {
        badge.textContent = `${Math.round(purchasingLightboxZoomState.scale * 100)}%`;
    }
}

function resetPurchasingLightboxZoom() {
    purchasingLightboxZoomState.scale = 1;
    purchasingLightboxZoomState.panX = 0;
    purchasingLightboxZoomState.panY = 0;
    purchasingLightboxZoomState.rotation = 0;
    purchasingLightboxZoomState.isDragging = false;
    applyPurchasingLightboxZoom();
}

function openPurchasingLightbox(item) {
    if (!item) return;
    const inv = item.invoice;
    const modal = document.getElementById('modal-purchasing-lightbox');
    const titleEl = document.getElementById('purchasing-lightbox-title');
    const subtitleEl = document.getElementById('purchasing-lightbox-subtitle');
    const imgEl = document.getElementById('purchasing-lightbox-img');
    const extLink = document.getElementById('btn-purchasing-open-external');

    if (titleEl) {
        titleEl.textContent = `${item.vendorName} - Factura N°. ${item.invoiceRef || 'Sin N°'}`;
    }
    if (subtitleEl) {
        subtitleEl.textContent = `RUC: ${item.providerRuc || 'Sin RUC'} | Monto Total: ${window.formatCurrency(item.totalAmount, item.currency)} | Archivo: ${inv.name}`;
    }

    const imgSrc = inv.imageSrc || inv.base64 || '';
    if (imgEl) {
        imgEl.src = imgSrc;
    }
    if (extLink) {
        if (imgSrc) {
            extLink.href = imgSrc;
            extLink.classList.remove('hidden');
        } else {
            extLink.classList.add('hidden');
        }
    }

    resetPurchasingLightboxZoom();
    if (modal) {
        openModal(modal);
        if (window.lucide) window.lucide.createIcons();
    }
}

function initPurchasingLightboxControls() {
    const viewport = document.getElementById('purchasing-lightbox-viewport');
    const btnIn = document.getElementById('btn-purchasing-zoom-in');
    const btnOut = document.getElementById('btn-purchasing-zoom-out');
    const btnReset = document.getElementById('btn-purchasing-zoom-reset');
    const btnRotate = document.getElementById('btn-purchasing-zoom-rotate');
    const btnClose = document.getElementById('btn-close-purchasing-lightbox');
    const btnCloseFooter = document.getElementById('btn-close-purchasing-lightbox-footer');
    const modal = document.getElementById('modal-purchasing-lightbox');

    if (btnClose && modal) {
        btnClose.addEventListener('click', () => closeModal(modal));
    }
    if (btnCloseFooter && modal) {
        btnCloseFooter.addEventListener('click', () => closeModal(modal));
    }

    if (btnIn) {
        btnIn.addEventListener('click', (e) => {
            e.stopPropagation();
            purchasingLightboxZoomState.scale = Math.min(purchasingLightboxZoomState.scale * 1.3, 6);
            applyPurchasingLightboxZoom();
        });
    }
    if (btnOut) {
        btnOut.addEventListener('click', (e) => {
            e.stopPropagation();
            purchasingLightboxZoomState.scale = Math.max(purchasingLightboxZoomState.scale / 1.3, 0.4);
            applyPurchasingLightboxZoom();
        });
    }
    if (btnReset) {
        btnReset.addEventListener('click', (e) => {
            e.stopPropagation();
            resetPurchasingLightboxZoom();
        });
    }
    if (btnRotate) {
        btnRotate.addEventListener('click', (e) => {
            e.stopPropagation();
            purchasingLightboxZoomState.rotation = (purchasingLightboxZoomState.rotation + 90) % 360;
            applyPurchasingLightboxZoom();
        });
    }

    if (viewport) {
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.85 : 1.15;
            purchasingLightboxZoomState.scale = Math.min(Math.max(purchasingLightboxZoomState.scale * delta, 0.4), 6);
            applyPurchasingLightboxZoom();
        }, { passive: false });

        viewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            purchasingLightboxZoomState.isDragging = true;
            purchasingLightboxZoomState.startX = e.clientX - purchasingLightboxZoomState.panX;
            purchasingLightboxZoomState.startY = e.clientY - purchasingLightboxZoomState.panY;
            viewport.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!purchasingLightboxZoomState.isDragging) return;
            purchasingLightboxZoomState.panX = e.clientX - purchasingLightboxZoomState.startX;
            purchasingLightboxZoomState.panY = e.clientY - purchasingLightboxZoomState.startY;
            applyPurchasingLightboxZoom();
        });

        window.addEventListener('mouseup', () => {
            if (purchasingLightboxZoomState.isDragging) {
                purchasingLightboxZoomState.isDragging = false;
                if (viewport) viewport.style.cursor = 'grab';
            }
        });
    }
}
