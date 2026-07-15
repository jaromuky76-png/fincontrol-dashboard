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
    viewInvoiceDate: document.getElementById('view-invoice-date'),
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
const DB_VERSION = 1;

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
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
    if (!ReconState.supportFiles) ReconState.supportFiles = [];
    
    // Accumulate files without duplicates
    filesArray.forEach(file => {
        const duplicate = ReconState.supportFiles.some(f => f.name === file.name && f.size === file.size);
        if (!duplicate) {
            ReconState.supportFiles.push(file);
        }
    });
    
    const totalCount = ReconState.supportFiles.length;
    if (totalCount === 1) {
        const file = ReconState.supportFiles[0];
        reconElements.zipFileInfo.textContent = `${file.name} (${formatBytes(file.size)})`;
        reconElements.zipFileInfo.style.color = 'var(--color-success)';
        ReconState.zipFile = file;
    } else {
        reconElements.zipFileInfo.textContent = `${totalCount} archivos de soporte cargados`;
        reconElements.zipFileInfo.style.color = 'var(--color-success)';
        ReconState.zipFile = ReconState.supportFiles[0];
    }
    
    // Show clear support button if present
    const btnClearSupport = document.getElementById('btn-clear-support-files');
    if (btnClearSupport) {
        btnClearSupport.classList.remove('hidden');
    }
    
    window.showToast(`${filesArray.length} archivo(s) de soporte cargado(s) (Total: ${totalCount})`, 'success');
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
                        if (!zipEntry.dir && /\.(png|jpe?g|webp|pdf)$/i.test(zipEntry.name)) {
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
                            addLog(`Página ${p} del PDF ${fileEntry.name} tiene poco texto digital. Ejecutando OCR en imagen renderizada...`, 'info');
                            try {
                                const ocrResult = await worker.recognize(imageSrc);
                                text = ocrResult.data.text;
                                addLog(`OCR finalizado para ${pageItemName}.`, 'success');
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
                    
                    addLog(`Ejecutando OCR en imagen: ${fileEntry.name}...`, 'info');
                    let text = "";
                    let confidence = 0;
                    if (worker) {
                        const ocrResult = await worker.recognize(imageSrc);
                        text = ocrResult.data.text;
                        confidence = ocrResult.data.confidence || 0;
                    }
                    
                    const docDetails = classifyAndExtractDocument(text, fileEntry.name);
                    const isLowQuality = (confidence < 45) || (text.trim().length < 40 && docDetails.docType === 'invoice' && !docDetails.amount && !docDetails.date);
                    
                    addLog(`[Procesado] "${fileEntry.name}": Tipo: ${docDetails.docType.toUpperCase()}, Ref: ${docDetails.invoiceRef || '---'}, Monto: ${docDetails.amount ? window.formatCurrency(docDetails.amount, docDetails.currency) : '---'}`, 'success');
                    
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

function classifyAndExtractDocument(text, fileName) {
    const textLower = text.toLowerCase();
    const textNorm = normalizeTextForClassification(text);
    const fileNorm = normalizeTextForClassification(fileName);
    
    // 1. SCORING SYSTEM FOR CLASSIFICATION
    let retentionScore = 0;
    let invoiceScore = 0;
    
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
    if (fileNorm.includes("factura") || fileNorm.includes("invoice") || fileNorm.includes("compra") || fileNorm.includes("recibo")) {
        invoiceScore += 20;
    }
    
    // --- Decision Logic ---
    let docType = 'invoice';
    if (retentionScore > invoiceScore && retentionScore >= 8) {
        const isMunicipal = hasRetencionMunicipal || textNorm.includes("municipal") || textNorm.includes("alcaldia") || textNorm.includes("alma") || textNorm.includes("imi") || fileNorm.includes("municipal");
        const isExemption = hasExemptionHeader || textNorm.includes("exencion") || textNorm.includes("exento") || fileNorm.includes("exencion");
        
        if (isExemption && !hasConstancia) {
            docType = 'exencion';
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
    }

    return {
        docType,
        invoiceRef,
        baseAmount,
        withheldAmount,
        amount,
        subtotal,
        date,
        dateStr,
        currency
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
    
    // Tokenize transaction description into words of length >= 4
    const tokens = txDescription.toLowerCase().match(/[a-zñáéíóúü]{4,}/g) || [];
    const commonWords = new Set([
        'comercial', 'limitada', 'corporation', 'corporativo', 'services', 'servicio', 'servicios',
        'estacion', 'pago', 'tienda', 'super', 'supermercado', 'express', 'factura', 'recibo',
        'compra', 'ventas', 'venta', 'del', 'las', 'los', 'con', 'por', 'para', 'una', 'uno',
        'nacional', 'internacional', 'nicaragua', 'managua', 'telef', 'telefono', 'celular',
        'asociados', 'grupo', 'centro', 'plaza', 'mall', 'inversiones', 'industrial'
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
        }

        const invoicesRequiringRet = (tx.currency === 'USD' || isFuelStation) ? [] : tx.invoices.filter(inv => {
            const baseAmount = tx.amount / (tx.invoices.length || 1);
            const estSubtotal = baseAmount / 1.15;
            return (tx.currency === 'NIO' && estSubtotal > thresholdNIO);
        });

        if (invoicesRequiringRet.length > 0) {
            tx.requiresRetentions = true;

            // If already exempt (manually linked exemption doc), bypass all retention checks
            if (tx.isExempt && tx.exemptionDoc) {
                tx.exemptionDoc.matched = true;
                tx.retentionsIRValid = true;
                tx.retentionsMunicipalValid = true;
                tx.retentionsValid = true;
                // skip retention scanning for this transaction
            } else {
            
            let allIRFound = true;
            let allMunicipalFound = true;

            invoicesRequiringRet.forEach(inv => {
                const baseAmount = tx.amount / (tx.invoices.length || 1);
                const estSubtotal = baseAmount / 1.15;
                const invoiceRef = inv.invoiceRef;
                const expectedIRRate = 0.02;
                const expectedMunicipalRate = 0.01;

                // If exempt mid-loop (found via auto-match in a previous iteration), skip
                if (tx.isExempt) return;

                // Search for Exemption document
                {
                    const foundExemption = ReconState.invoices.find(doc => {
                        if (doc.matched || doc.docType !== 'exencion') return false;
                        const matchesInvoiceRef = invoiceRef && doc.invoiceRef && (invoiceRef === doc.invoiceRef);
                        const matchesBase = doc.baseAmount && (Math.abs(doc.baseAmount - estSubtotal) < 15.0);
                        return matchesInvoiceRef || matchesBase;
                    });

                    if (foundExemption) {
                        foundExemption.matched = true;
                        tx.isExempt = true;
                        tx.exemptionDoc = foundExemption;
                        allIRFound = true;
                        allMunicipalFound = true;
                        return; // Skip other checks for this invoice
                    }
                }

                // Search for Retención IR document
                if (tx.hasRetencionIR && tx.retentionIRDoc) {
                    tx.retentionIRDoc.matched = true;
                    if (!tx.retentionIRDoc.baseAmount) {
                        tx.retentionIRDoc.baseAmount = estSubtotal;
                    }
                    if (!tx.retentionIRDoc.withheldAmount) {
                        tx.retentionIRDoc.withheldAmount = tx.retentionIRDoc.baseAmount * expectedIRRate;
                    }
                } else {
                    const foundIR = ReconState.invoices.find(doc => {
                        if (doc.matched || doc.docType !== 'retencion_ir') return false;
                        const matchesInvoiceRef = invoiceRef && doc.invoiceRef && (invoiceRef === doc.invoiceRef);
                        const matchesBase = doc.baseAmount && (Math.abs(doc.baseAmount - estSubtotal) < 15.0);
                        const matchesWithheld = doc.withheldAmount && (Math.abs(doc.withheldAmount - (expectedIRRate * estSubtotal)) < 5.0);
                        return matchesInvoiceRef || matchesBase || matchesWithheld;
                    });

                    if (foundIR) {
                        foundIR.matched = true;
                        tx.hasRetencionIR = true;
                        tx.retentionIRDoc = foundIR;
                        if (!foundIR.baseAmount) {
                            foundIR.baseAmount = estSubtotal;
                        }
                        if (!foundIR.withheldAmount) {
                            foundIR.withheldAmount = foundIR.baseAmount * expectedIRRate;
                        }
                    } else {
                        allIRFound = false;
                    }
                }

                // Search for Retención Municipal document (NIO local only)
                if (tx.currency === 'NIO') {
                    if (tx.hasRetencionMunicipal && tx.retentionMunicipalDoc) {
                        tx.retentionMunicipalDoc.matched = true;
                        if (!tx.retentionMunicipalDoc.baseAmount) {
                            tx.retentionMunicipalDoc.baseAmount = estSubtotal;
                        }
                        if (!tx.retentionMunicipalDoc.withheldAmount) {
                            tx.retentionMunicipalDoc.withheldAmount = tx.retentionMunicipalDoc.baseAmount * expectedMunicipalRate;
                        }
                    } else {
                        const foundMunicipal = ReconState.invoices.find(doc => {
                            if (doc.matched || doc.docType !== 'retencion_municipal') return false;
                            const matchesInvoiceRef = invoiceRef && doc.invoiceRef && (invoiceRef === doc.invoiceRef);
                            const matchesBase = doc.baseAmount && (Math.abs(doc.baseAmount - estSubtotal) < 15.0);
                            const matchesWithheld = doc.withheldAmount && (Math.abs(doc.withheldAmount - (expectedMunicipalRate * estSubtotal)) < 3.0);
                            return matchesInvoiceRef || matchesBase || matchesWithheld;
                        });

                        if (foundMunicipal) {
                            foundMunicipal.matched = true;
                            tx.hasRetencionMunicipal = true;
                            tx.retentionMunicipalDoc = foundMunicipal;
                            if (!foundMunicipal.baseAmount) {
                                foundMunicipal.baseAmount = estSubtotal;
                            }
                            if (!foundMunicipal.withheldAmount) {
                                foundMunicipal.withheldAmount = foundMunicipal.baseAmount * expectedMunicipalRate;
                            }
                        } else {
                            allMunicipalFound = false;
                        }
                    }
                }
            });

            tx.retentionsIRValid = allIRFound;
            tx.retentionsMunicipalValid = allMunicipalFound;

            if (tx.isExempt) {
                tx.retentionsValid = true;
            } else if (tx.currency === 'USD') {
                tx.retentionsValid = true; // USD doesn't require retentions, but fallback
            } else {
                tx.retentionsValid = tx.hasRetencionIR && allIRFound && tx.hasRetencionMunicipal && allMunicipalFound;
            }
            } // end else (not pre-exempt)
        } else {
            tx.requiresRetentions = false;
            tx.retentionsValid = true;
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
    if (!tx.requiresRetentions) {
        return `<span class="badge" style="background-color: rgba(148, 163, 184, 0.1); color: var(--text-muted);"><i data-lucide="minus"></i>No Requiere</span>`;
    }
    
    let html = `<div style="display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start;">`;
    
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
    const orphanInvoices = ReconState.invoices.filter(i => !i.matched).length;

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
                invoiceNames = tx.invoices ? tx.invoices.map(i => i.name).join(', ') : (tx.invoice ? tx.invoice.name : '---');
                invoiceDates = tx.invoices ? tx.invoices.map(i => i.extractedDateStr || 'No ident.').join(', ') : (tx.invoice ? (tx.invoice.extractedDateStr || 'No identificada') : 'No identificada');

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

                let retentionButtonsHTML = '';
                if (tx.requiresRetentions) {
                    if (tx.isExempt) {
                        retentionButtonsHTML += `
                            <button class="btn btn-success btn-sm btn-view-exemption-action" data-id="${tx.id}" title="Ver Exención de Impuestos" style="margin: 0.1rem;">
                                <i data-lucide="shield-check"></i>Ver Exención
                            </button>
                        `;
                    } else {
                        // 1. IR Withholding
                        if (tx.hasRetencionIR && tx.retentionsIRValid && tx.retentionIRDoc) {
                            const irLabel = 'IR 2%';
                            retentionButtonsHTML += `
                                <button class="btn btn-success btn-sm btn-view-retention-ir-action" data-id="${tx.id}" title="Ver Retención ${irLabel}" style="margin: 0.1rem;">
                                    <i data-lucide="eye"></i>Ver ${irLabel}
                                </button>
                            `;
                        } else {
                            const irLabel = 'IR 2%';
                            retentionButtonsHTML += `
                                <button class="btn btn-warning btn-sm btn-upload-retention-ir-action" data-id="${tx.id}" title="Subir Retención ${irLabel}" style="margin: 0.1rem;">
                                    <i data-lucide="upload"></i>Subir ${irLabel}
                                </button>
                            `;
                        }

                        // 2. Municipal Withholding (NIO only)
                        if (tx.currency !== 'USD') {
                            if (tx.hasRetencionMunicipal && tx.retentionsMunicipalValid && tx.retentionMunicipalDoc) {
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
                                `;
                            }
                        }

                        // 3. Option to Upload Exemption
                        retentionButtonsHTML += `
                            <button class="btn btn-secondary btn-sm btn-upload-exemption-action" data-id="${tx.id}" title="Subir Constancia de Exención" style="margin: 0.1rem; border: 1px dashed var(--color-primary); color: var(--color-primary); background: transparent;">
                                <i data-lucide="shield"></i>Subir Exención
                            </button>
                        `;
                    }
                }

                viewButtonsHTML = `
                    <div style="display: flex; gap: 0.25rem; justify-content: center; align-items: center; flex-wrap: wrap;">
                        ${invoiceButtonsHTML || '---'}
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
                <td class="text-muted" style="font-size: 0.8rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${invoiceNames}</td>
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
    
    // Filter to ONLY actual invoice documents
    const orphansList = ReconState.invoices.filter(i => !i.matched && i.docType === 'invoice');
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
                    ${escapeHtml(inv.text.substring(0, 100))}...
                </td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-sm btn-view-orphan-action" data-idx="${idx}">
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
        
        const retventionsList = ReconState.invoices.filter(i => i.docType === 'retencion_ir' || i.docType === 'retencion_municipal' || i.docType === 'exencion');
        
        // Update header count
        const countRetentions = document.getElementById('count-retentions');
        if (countRetentions) {
            countRetentions.textContent = retventionsList.length;
        }

        if (retventionsList.length === 0) {
            tbodyRetentions.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No hay comprobantes de retención o exenciones cargados.</td></tr>`;
        } else {
            retventionsList.forEach((doc, idx) => {
                const tr = document.createElement('tr');
                
                let docTypeStr = "Exención";
                if (doc.docType === 'retencion_ir') docTypeStr = "Retención IR 2%";
                else if (doc.docType === 'retencion_municipal') docTypeStr = "Retención Municipal 1%";

                let baseAmt = doc.baseAmount ? window.formatCurrency(doc.baseAmount, doc.currency || 'NIO') : '---';
                let withheldAmt = doc.withheldAmount ? window.formatCurrency(doc.withheldAmount, doc.currency || 'NIO') : '---';
                
                const associatedTx = ReconState.transactions.find(t => 
                    t.retentionIRDoc === doc || 
                    t.retentionMunicipalDoc === doc || 
                    t.exemptionDoc === doc
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
    lucide.createIcons();
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

    // 3. View orphan invoice details
    document.querySelectorAll('.btn-view-orphan-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.idx, 10);
            const orphans = ReconState.invoices.filter(i => !i.matched);
            const inv = orphans[idx];
            if (inv) {
                openViewInvoiceModal(inv);
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

function openUploadModalForTx(txOrGroup, isReimbursement = false, isRetention = false, retentionType = null) {
    const isGroup = Array.isArray(txOrGroup);
    const tx = isGroup ? txOrGroup[0] : txOrGroup;
    
    ReconState.singleInvoiceTargetTx = tx;
    ReconState.targetTxGroup = isGroup ? txOrGroup : [txOrGroup];
    ReconState.uploadIsReimbursement = isReimbursement;
    ReconState.uploadIsRetention = isRetention;
    ReconState.uploadRetentionType = retentionType;
    
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
            
            updateSingleProgress(30, 'Cargando motor de OCR...');
            const worker = await Tesseract.createWorker('spa+eng');
            
            updateSingleProgress(50, 'Escaneando texto de la imagen...');
            const result = await worker.recognize(imageSrc);
            text = result.data.text;
            confidence = result.data.confidence || 0;
            isLowQuality = (confidence < 45) || (text.trim().length < 40);
            
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
            currency: targetTx.currency || docDetails.currency || 'NIO'
        };

        // Link with the transaction
        if (isReimbursementUpload) {
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
        } else if (docDetails.docType === 'invoice') {
            if (!targetTx.invoices) targetTx.invoices = [];
            targetTx.matched = true;
            targetTx.isReimbursement = false;
            targetTx.reimbursementDoc = null;
            targetTx.invoices.push(newDoc);
            targetTx.isManual = true;
            newDoc.isManual = true;
            window.showToast('Factura cargada y vinculada a la transacción', 'success');
        } else {
            // Force associate this doc to the target transaction
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
        } else {
            modalTitle.textContent = 'Visualizar Factura de Respaldo';
        }
    }
    
    const viewPdfIframe = document.getElementById('view-invoice-pdf');
    const isPdfDoc = invoice.name.toLowerCase().endsWith('.pdf') && invoice.imageSrc && invoice.imageSrc.startsWith('data:application/pdf');
    if (isPdfDoc) {
        if (viewPdfIframe) {
            viewPdfIframe.src = invoice.imageSrc;
            viewPdfIframe.classList.remove('hidden');
            reconElements.viewInvoiceImg.classList.add('hidden');
        }
    } else {
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
        } else {
            reconElements.viewInvoiceImg.src = invoice.imageSrc;
        }
    }
    reconElements.viewInvoiceName.textContent = invoice.name;
    reconElements.viewInvoiceDate.textContent = invoice.extractedDateStr || 'No identificada';
    
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
        } else {
            reconElements.viewInvoiceAmount.textContent = invoice.extractedAmount ? window.formatCurrency(invoice.extractedAmount, invCurrency) : 'No detectado';
        }
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
        
        const targetList = ReconState.transactions.filter(t => t.type === 'charge');
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
                opt.textContent = `${t.dateStr} | ${t.description.substring(0, 30)} | ${formattedAmt}`;
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
    reconElements.viewInvoiceRawText.textContent = invoice.text || 'Sin texto extraído.';
    
    reconElements.modalView.classList.add('active');
    lucide.createIcons();
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
        t.exemptionDoc === invoice
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


function closeModal(modalElement) {
    modalElement.classList.remove('active');
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
            lucide.createIcons();
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
    
    lucide.createIcons();
    
    // Smooth scroll down to the results section
    const resultsSec = document.getElementById('reconciliation-results');
    if (resultsSec) {
        resultsSec.scrollIntoView({ behavior: 'smooth' });
    }
}

// --- HELPERS ---

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
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
            vehiclePlate: tx.vehiclePlate || ''
        };
    });

    // Create the reconciliation record
    const record = {
        id: 'recon-' + Date.now(),
        month,
        year,
        number,
        savedAt: new Date().toISOString(),
        transactions: savedTransactions,
        invoices: savedInvoices,
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

    lucide.createIcons();
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
            currency: doc.currency || 'NIO'
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

    // Store record period metadata on State so PDF generation knows the saved period details
    ReconState.loadedPeriod = {
        month: record.month,
        year: record.year,
        number: record.number
    };

    // Re-apply matching algorithm so that new rules (e.g. PUMA/UNO exemption, 
    // exemption doc fix) take effect on historical data without re-uploading files.
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

            const supportStatus = ((tx.invoices && tx.invoices.length > 0) || tx.invoice) ? 'Disponible' : 'No disponible';

            return [
                tx.dateStr,
                tx.reference || '---',
                tx.description.substring(0, 30) + (tx.vehiclePlate ? ` [Placa: ${tx.vehiclePlate}]` : ''),
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
                5: { cellWidth: 18 }, // Factura Soporte
                6: { cellWidth: 28 }  // Impuestos / Retenciones
            },
            head: [['Fecha', 'Referencia', 'Comercio', 'Monto NIO', 'Monto USD', 'Factura Soporte', 'Impuestos / Retenciones']],
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
