/**
 * FinControl - Accounting & Labor Costing Module (Modo Contable)
 * Processes monthly sales consolidated Excel spreadsheets ("Consolidado de Ventas"),
 * identifies labor codes for Taller Maestro (T49) and Centro de Servicios (T39),
 * and generates 2-column reports (Código Identificado y Descripción).
 * 
 * Optimized for large Excel files (150MB+) using JSZip streaming and fast XML parsing.
 */

(function () {

    // Active Catalogs State (initialized with defaults from master_catalogs.js)
    let maestrosCatalog = (typeof DEFAULT_MAESTROS_CATALOG !== 'undefined') ? { ...DEFAULT_MAESTROS_CATALOG } : {};
    let csCatalog = (typeof DEFAULT_CS_CATALOG !== 'undefined') ? { ...DEFAULT_CS_CATALOG } : {};

    // Current Analysis Results State
    let currentResults = {
        fileName: '',
        totalSalesRows: 0,
        totalLaborRows: 0,
        maestrosMatches: [], // Array of { code, desc, frequency }
        csMatches: []        // Array of { code, desc, frequency }
    };

    // DOM Elements Cache
    let elements = {};

    document.addEventListener('DOMContentLoaded', () => {
        initAccountingElements();
        initAccountingEvents();
        updateCatalogBadges();
    });

    function initAccountingElements() {
        elements = {
            // Catalogs UI
            badgeMaestrosCount: document.getElementById('badge-maestros-count'),
            badgeCsCount: document.getElementById('badge-cs-count'),
            btnUpdateCatalogs: document.getElementById('btn-update-catalogs'),

            // Upload & Controls
            dropZoneSales: document.getElementById('drop-excel-sales'),
            inputSalesFile: document.getElementById('input-excel-sales'),
            salesFileInfo: document.getElementById('sales-file-info'),
            btnProcessAccounting: document.getElementById('btn-process-accounting'),
            btnClearAccounting: document.getElementById('btn-clear-accounting'),

            // Progress Panel
            panelProgress: document.getElementById('panel-progress-accounting'),
            progressBar: document.getElementById('progress-bar-accounting'),
            progressText: document.getElementById('progress-text-accounting'),

            // Results Panel & KPIs
            panelResults: document.getElementById('panel-accounting-results'),
            kpiTotalIdentified: document.getElementById('kpi-total-identified'),
            kpiMaestrosCodes: document.getElementById('kpi-maestros-codes'),
            kpiCsCodes: document.getElementById('kpi-cs-codes'),
            kpiTotalOccurrences: document.getElementById('kpi-total-occurrences'),
            lblSalesFilename: document.getElementById('lbl-sales-filename'),

            // Maestros Report (T49)
            searchMaestros: document.getElementById('search-maestros'),
            tableMaestrosBody: document.getElementById('table-maestros-body'),
            countMaestrosTable: document.getElementById('count-maestros-table'),
            btnExportMaestrosExcel: document.getElementById('btn-export-maestros-excel'),
            btnExportMaestrosPdf: document.getElementById('btn-export-maestros-pdf'),
            btnCopyMaestros: document.getElementById('btn-copy-maestros'),

            // CS Report (T39)
            searchCs: document.getElementById('search-cs'),
            tableCsBody: document.getElementById('table-cs-body'),
            countCsTable: document.getElementById('count-cs-table'),
            btnExportCsExcel: document.getElementById('btn-export-cs-excel'),
            btnExportCsPdf: document.getElementById('btn-export-cs-pdf'),
            btnCopyCs: document.getElementById('btn-copy-cs')
        };
    }

    function updateCatalogBadges() {
        if (elements.badgeMaestrosCount) {
            elements.badgeMaestrosCount.textContent = `${Object.keys(maestrosCatalog).length} códigos`;
        }
        if (elements.badgeCsCount) {
            elements.badgeCsCount.textContent = `${Object.keys(csCatalog).length} códigos`;
        }
    }

    function initAccountingEvents() {
        if (!elements.inputSalesFile || !elements.dropZoneSales) return;

        // Click on dropzone triggers file picker
        elements.dropZoneSales.addEventListener('click', (e) => {
            if (e.target !== elements.inputSalesFile) {
                elements.inputSalesFile.click();
            }
        });

        // Drag & Drop event handlers for dropZoneSales
        ['dragenter', 'dragover'].forEach(eventName => {
            elements.dropZoneSales.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                elements.dropZoneSales.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            elements.dropZoneSales.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                elements.dropZoneSales.classList.remove('dragover');
            }, false);
        });

        elements.dropZoneSales.addEventListener('drop', (e) => {
            const files = e.dataTransfer ? e.dataTransfer.files : null;
            if (files && files.length > 0) {
                const file = files[0];
                handleSalesFileSelection(file);
                processSalesExcelFile(file); // Automatically trigger processing!
            }
        });

        // File Selection Listener (File picker change)
        elements.inputSalesFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleSalesFileSelection(file);
                processSalesExcelFile(file); // Automatically trigger processing!
            }
        });

        // Process Button Listener (Manual fallback click)
        elements.btnProcessAccounting.addEventListener('click', (e) => {
            e.stopPropagation();
            const file = elements.inputSalesFile.files[0];
            if (file) {
                processSalesExcelFile(file);
            } else {
                showToast('Por favor selecciona o arrastra un archivo Excel (.xlsx)', 'warning');
            }
        });

        // Clear Button Listener
        elements.btnClearAccounting.addEventListener('click', () => {
            resetAccountingForm();
        });

        // Search Filters
        if (elements.searchMaestros) {
            elements.searchMaestros.addEventListener('input', () => renderMaestrosTable());
        }
        if (elements.searchCs) {
            elements.searchCs.addEventListener('input', () => renderCsTable());
        }

        // Export Buttons for Maestros
        if (elements.btnExportMaestrosExcel) {
            elements.btnExportMaestrosExcel.addEventListener('click', () => exportToExcel('Maestros_T49', currentResults.maestrosMatches, 'Mano de Obra - Taller Maestro (T49)'));
        }
        if (elements.btnExportMaestrosPdf) {
            elements.btnExportMaestrosPdf.addEventListener('click', () => exportToPDF('Maestros_T49', currentResults.maestrosMatches, 'Reporte de Mano de Obra - Taller Maestro (T49)'));
        }
        if (elements.btnCopyMaestros) {
            elements.btnCopyMaestros.addEventListener('click', () => copyTableToClipboard(currentResults.maestrosMatches, 'Maestros T49'));
        }

        // Export Buttons for CS
        if (elements.btnExportCsExcel) {
            elements.btnExportCsExcel.addEventListener('click', () => exportToExcel('Centro_Servicios_T39', currentResults.csMatches, 'Mano de Obra - Centro de Servicios (T39)'));
        }
        if (elements.btnExportCsPdf) {
            elements.btnExportCsPdf.addEventListener('click', () => exportToPDF('Centro_Servicios_T39', currentResults.csMatches, 'Reporte de Mano de Obra - Centro de Servicios (T39)'));
        }
        if (elements.btnCopyCs) {
            elements.btnCopyCs.addEventListener('click', () => copyTableToClipboard(currentResults.csMatches, 'Centro de Servicios T39'));
        }
    }

    function handleSalesFileSelection(file) {
        if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
            showToast('Formato no válido. Por favor sube un archivo Excel (.xlsx)', 'error');
            elements.salesFileInfo.textContent = 'Archivo no válido';
            elements.btnProcessAccounting.disabled = true;
            return false;
        }

        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        elements.salesFileInfo.textContent = `${file.name} (${sizeMb} MB)`;
        elements.btnProcessAccounting.disabled = false;
        showToast(`Archivo "${file.name}" (${sizeMb} MB) cargado. Procesando...`, 'info');
        return true;
    }

    function resetAccountingForm() {
        elements.inputSalesFile.value = '';
        elements.salesFileInfo.textContent = 'Ningún archivo seleccionado';
        elements.btnProcessAccounting.disabled = true;
        elements.panelProgress.classList.add('hidden');
        elements.panelResults.classList.add('hidden');
        elements.btnClearAccounting.classList.add('hidden');
        currentResults = {
            fileName: '',
            totalSalesRows: 0,
            totalLaborRows: 0,
            maestrosMatches: [],
            csMatches: []
        };
        showToast('Vista de costeo reiniciada', 'info');
    }

    function updateProgress(percent, text) {
        if (elements.panelProgress) elements.panelProgress.classList.remove('hidden');
        if (elements.progressBar) elements.progressBar.style.width = `${percent}%`;
        if (elements.progressText) elements.progressText.textContent = text;
    }

    /**
     * Process Sales Excel File (Fast JSZip streaming or SheetJS fallback)
     */
    async function processSalesExcelFile(file) {
        if (!file) return;

        elements.btnProcessAccounting.disabled = true;
        updateProgress(5, 'Iniciando lectura de archivo Excel...');

        setTimeout(async () => {
            try {
                let results;
                if (file.name.match(/\.xlsx$/i) && typeof JSZip !== 'undefined') {
                    results = await parseXlsxWithJSZip(file);
                } else if (typeof XLSX !== 'undefined') {
                    results = await parseWithSheetJS(file);
                } else {
                    throw new Error('No se encontró una librería para leer archivos Excel (JSZip / XLSX).');
                }

                currentResults = results;

                updateProgress(100, 'Procesamiento completado.');

                setTimeout(() => {
                    elements.panelProgress.classList.add('hidden');
                    renderAccountingResults();
                }, 300);

            } catch (err) {
                console.error('Error processing sales Excel file:', err);
                elements.panelProgress.classList.add('hidden');
                elements.btnProcessAccounting.disabled = false;
                showToast(`Error al procesar archivo: ${err.message}`, 'error');
            }
        }, 50);
    }

    /**
     * Ultra-fast JSZip XML Parser for 150MB+ .xlsx files
     */
    async function parseXlsxWithJSZip(file) {
        updateProgress(15, `Leyendo buffer del archivo (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);
        const arrayBuffer = await file.arrayBuffer();

        updateProgress(35, 'Descomprimiendo estructura Excel (JSZip)...');
        const zip = await JSZip.loadAsync(arrayBuffer);

        // 1. Locate sheet path for 'Ventas'
        let sheetPath = null;
        const wbFile = zip.file('xl/workbook.xml');
        if (wbFile) {
            const wbXml = await wbFile.async('string');
            const sheetMatch = wbXml.match(/<sheet[^>]*name="Ventas"[^>]*r:id="([^"]+)"/i) ||
                               wbXml.match(/<sheet[^>]*r:id="([^"]+)"[^>]*name="Ventas"/i);
            if (sheetMatch) {
                const rId = sheetMatch[1];
                const relsFile = zip.file('xl/_rels/workbook.xml.rels');
                if (relsFile) {
                    const relsXml = await relsFile.async('string');
                    const relMatch = new RegExp(`rId="${rId}"[^>]*Target="([^"]+)"`, 'i').exec(relsXml) ||
                                     new RegExp(`Target="([^"]+)"[^>]*rId="${rId}"`, 'i').exec(relsXml);
                    if (relMatch) {
                        sheetPath = 'xl/' + relMatch[1].replace(/^\/xl\//, '').replace(/^xl\//, '');
                    }
                }
            }
        }

        // Fallback sheet search if sheetPath not resolved
        if (!sheetPath) {
            const sheetFiles = Object.keys(zip.files).filter(f => f.match(/^xl\/worksheets\/sheet\d+\.xml$/i));
            sheetPath = sheetFiles.length > 0 ? sheetFiles[0] : 'xl/worksheets/sheet1.xml';
        }

        updateProgress(55, 'Leyendo tabla de textos compartidos (SharedStrings)...');
        const sharedStrings = [];
        const ssFile = zip.file('xl/sharedStrings.xml');
        if (ssFile) {
            const ssXml = await ssFile.async('string');
            const siMatches = ssXml.match(/<si>(.*?)<\/si>/gs) || [];
            for (let i = 0; i < siMatches.length; i++) {
                const si = siMatches[i];
                const textMatch = si.match(/<t[^>]*>(.*?)<\/t>/gs);
                if (textMatch) {
                    const strVal = textMatch.map(t => t.replace(/<[^>]+>/g, '')).join('');
                    sharedStrings.push(strVal);
                } else {
                    sharedStrings.push('');
                }
            }
        }

        updateProgress(75, 'Extrayendo y filtrando códigos de mano de obra en Columna Q...');
        const sheetFile = zip.file(sheetPath);
        if (!sheetFile) {
            throw new Error('No se pudo encontrar la hoja "Ventas" en la estructura del archivo Excel.');
        }

        const sheetXml = await sheetFile.async('string');

        // Regex for cells in Column Q: <c r="Q123" ...><v>12345</v></c>
        const cellQRegex = /<c r="Q(\d+)"([^>]*)>(.*?)<\/c>/gs;
        const valRegex = /<v>(.*?)<\/v>/;
        const tAttrRegex = /t="([^"]+)"/;

        const maestrosFound = {};
        const csFound = {};
        let totalRowsProcessed = 0;
        let totalLaborOccurrences = 0;

        let match;
        while ((match = cellQRegex.exec(sheetXml)) !== null) {
            const rowIdx = match[1];
            const attrs = match[2];
            const inner = match[3];

            if (rowIdx === '1') continue; // Header row

            totalRowsProcessed++;

            const valMatch = valRegex.exec(inner);
            if (!valMatch) continue;

            let rawVal = valMatch[1];
            const tMatch = tAttrRegex.exec(attrs);
            const cellType = tMatch ? tMatch[1] : '';

            let codeStr = '';
            if (cellType === 's') {
                const ssIndex = parseInt(rawVal, 10);
                codeStr = (sharedStrings[ssIndex] || '').trim();
            } else {
                codeStr = rawVal.trim();
            }

            if (codeStr.endsWith('.0')) {
                codeStr = codeStr.slice(0, -2);
            }

            if (maestrosCatalog[codeStr] !== undefined) {
                totalLaborOccurrences++;
                if (!maestrosFound[codeStr]) {
                    maestrosFound[codeStr] = { code: codeStr, desc: maestrosCatalog[codeStr], frequency: 0 };
                }
                maestrosFound[codeStr].frequency++;
            }

            if (csCatalog[codeStr] !== undefined) {
                totalLaborOccurrences++;
                if (!csFound[codeStr]) {
                    csFound[codeStr] = { code: codeStr, desc: csCatalog[codeStr], frequency: 0 };
                }
                csFound[codeStr].frequency++;
            }
        }

        return {
            fileName: file.name,
            totalSalesRows: totalRowsProcessed,
            totalLaborRows: totalLaborOccurrences,
            maestrosMatches: Object.values(maestrosFound).sort((a, b) => a.desc.localeCompare(b.desc)),
            csMatches: Object.values(csFound).sort((a, b) => a.desc.localeCompare(b.desc))
        };
    }

    /**
     * Fallback parsing using SheetJS (XLSX)
     */
    function parseWithSheetJS(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    updateProgress(50, 'Parseando archivo Excel con SheetJS...');
                    const data = new Uint8Array(e.target.result);
                    let wb = XLSX.read(data, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false, cellText: false });

                    let targetSheetName = wb.SheetNames.find(s => s.trim().toLowerCase() === 'ventas') || wb.SheetNames[0];
                    const ws = wb.Sheets[targetSheetName];
                    if (!ws) throw new Error('Hoja "Ventas" no encontrada.');

                    const sheetRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
                    let colQIndex = 16;
                    const headerRow = sheetRows[0] || [];
                    for (let c = 0; c < headerRow.length; c++) {
                        const hVal = String(headerRow[c] || '').trim().toLowerCase();
                        if (hVal === 'productid' || hVal === 'codigo' || hVal === 'código' || hVal === 'rms') {
                            colQIndex = c;
                            break;
                        }
                    }

                    const maestrosFound = {};
                    const csFound = {};
                    let totalRowsProcessed = 0;
                    let totalLaborOccurrences = 0;

                    for (let i = 1; i < sheetRows.length; i++) {
                        const row = sheetRows[i];
                        if (!row) continue;
                        totalRowsProcessed++;

                        let rawCode = row[colQIndex];
                        if (rawCode === null || rawCode === undefined || rawCode === '') continue;

                        let codeStr = String(rawCode).trim();
                        if (codeStr.endsWith('.0')) codeStr = codeStr.slice(0, -2);

                        if (maestrosCatalog[codeStr] !== undefined) {
                            totalLaborOccurrences++;
                            if (!maestrosFound[codeStr]) maestrosFound[codeStr] = { code: codeStr, desc: maestrosCatalog[codeStr], frequency: 0 };
                            maestrosFound[codeStr].frequency++;
                        }

                        if (csCatalog[codeStr] !== undefined) {
                            totalLaborOccurrences++;
                            if (!csFound[codeStr]) csFound[codeStr] = { code: codeStr, desc: csCatalog[codeStr], frequency: 0 };
                            csFound[codeStr].frequency++;
                        }
                    }

                    resolve({
                        fileName: file.name,
                        totalSalesRows: totalRowsProcessed,
                        totalLaborRows: totalLaborOccurrences,
                        maestrosMatches: Object.values(maestrosFound).sort((a, b) => a.desc.localeCompare(b.desc)),
                        csMatches: Object.values(csFound).sort((a, b) => a.desc.localeCompare(b.desc))
                    });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Error de lectura en FileReader'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Render KPIs and Table Reports
     */
    function renderAccountingResults() {
        elements.panelResults.classList.remove('hidden');
        elements.btnClearAccounting.classList.remove('hidden');

        // Update KPIs
        const totalDistinctCodes = currentResults.maestrosMatches.length + currentResults.csMatches.length;
        elements.kpiTotalIdentified.textContent = totalDistinctCodes.toLocaleString();
        elements.kpiMaestrosCodes.textContent = currentResults.maestrosMatches.length.toLocaleString();
        elements.kpiCsCodes.textContent = currentResults.csMatches.length.toLocaleString();
        elements.kpiTotalOccurrences.textContent = currentResults.totalLaborRows.toLocaleString();
        elements.lblSalesFilename.textContent = currentResults.fileName;

        // Render Tables
        renderMaestrosTable();
        renderCsTable();

        showToast(`Mano de obra identificada: ${currentResults.maestrosMatches.length} Maestros y ${currentResults.csMatches.length} Centro de Servicios`, 'success');
    }

    /**
     * Render Maestros T49 Report Table (Exactly 2 columns: Código Identificado & Descripción)
     */
    function renderMaestrosTable() {
        const tbody = elements.tableMaestrosBody;
        tbody.innerHTML = '';

        const searchTerm = (elements.searchMaestros ? elements.searchMaestros.value.toLowerCase().trim() : '');

        const filtered = currentResults.maestrosMatches.filter(item =>
            item.code.toLowerCase().includes(searchTerm) ||
            item.desc.toLowerCase().includes(searchTerm)
        );

        if (elements.countMaestrosTable) {
            elements.countMaestrosTable.textContent = `${filtered.length} de ${currentResults.maestrosMatches.length} identificados`;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="2" class="text-center text-muted" style="padding: 2rem;">
                        <i data-lucide="search-x" style="width: 24px; height: 24px; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                        <p>No se encontraron códigos de mano de obra para Maestros (T49)</p>
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        filtered.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600; font-family: monospace; color: var(--color-primary); white-space: nowrap;">
                    ${escapeHtml(item.code)}
                </td>
                <td>
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                        <span>${escapeHtml(item.desc)}</span>
                        <span class="badge-freq" title="${item.frequency} facturaciones en la sábana">${item.frequency} f.</span>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Render Centro de Servicios T39 Report Table (Exactly 2 columns: Código Identificado & Descripción)
     */
    function renderCsTable() {
        const tbody = elements.tableCsBody;
        tbody.innerHTML = '';

        const searchTerm = (elements.searchCs ? elements.searchCs.value.toLowerCase().trim() : '');

        const filtered = currentResults.csMatches.filter(item =>
            item.code.toLowerCase().includes(searchTerm) ||
            item.desc.toLowerCase().includes(searchTerm)
        );

        if (elements.countCsTable) {
            elements.countCsTable.textContent = `${filtered.length} de ${currentResults.csMatches.length} identificados`;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="2" class="text-center text-muted" style="padding: 2rem;">
                        <i data-lucide="search-x" style="width: 24px; height: 24px; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                        <p>No se encontraron códigos de mano de obra para Centro de Servicios (T39)</p>
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        filtered.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600; font-family: monospace; color: var(--color-success); white-space: nowrap;">
                    ${escapeHtml(item.code)}
                </td>
                <td>
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                        <span>${escapeHtml(item.desc)}</span>
                        <span class="badge-freq badge-cs" title="${item.frequency} facturaciones en la sábana">${item.frequency} f.</span>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Export unit results to Excel (.xlsx)
     */
    function exportToExcel(filenamePrefix, dataArray, sheetTitle) {
        if (!dataArray || dataArray.length === 0) {
            showToast('No hay datos para exportar', 'warning');
            return;
        }

        try {
            const exportData = dataArray.map(item => ({
                'Código Identificado': item.code,
                'Descripción': item.desc,
                'Facturaciones (Frecuencia)': item.frequency
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            ws['!cols'] = [{ wch: 22 }, { wch: 65 }, { wch: 25 }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Mano de Obra');

            const monthTag = currentResults.fileName.replace(/\.xlsx$/i, '').trim();
            const fullFilename = `Reporte_${filenamePrefix}_${monthTag || 'Costeo'}.xlsx`;

            XLSX.writeFile(wb, fullFilename);
            showToast(`Reporte descargado: ${fullFilename}`, 'success');
        } catch (err) {
            console.error('Error exporting to Excel:', err);
            showToast(`Error al exportar a Excel: ${err.message}`, 'error');
        }
    }

    /**
     * Export unit results to PDF using jsPDF & AutoTable
     */
    function exportToPDF(filenamePrefix, dataArray, documentTitle) {
        if (!dataArray || dataArray.length === 0) {
            showToast('No hay datos para exportar', 'warning');
            return;
        }

        if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
            showToast('Librería jsPDF no cargada', 'error');
            return;
        }

        try {
            const { jsPDF } = window.jspdf || window;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

            doc.setFontSize(16);
            doc.setTextColor(14, 165, 233);
            doc.text(documentTitle, 14, 18);

            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(`Archivo Sábana: ${currentResults.fileName || 'Consolidado de Ventas'}`, 14, 25);
            doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-ES')} | Total códigos: ${dataArray.length}`, 14, 30);

            const tableRows = dataArray.map(item => [item.code, item.desc]);

            doc.autoTable({
                startY: 35,
                head: [['Código Identificado', 'Descripción de la Actividad']],
                body: tableRows,
                theme: 'striped',
                headStyles: {
                    fillColor: [14, 165, 233],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 9
                },
                bodyStyles: {
                    fontSize: 8.5,
                    cellPadding: 3
                },
                columnStyles: {
                    0: { cellWidth: 45, fontStyle: 'bold' },
                    1: { cellWidth: 'auto' }
                }
            });

            const monthTag = currentResults.fileName.replace(/\.xlsx$/i, '').trim();
            const fullFilename = `Reporte_${filenamePrefix}_${monthTag || 'Costeo'}.pdf`;

            doc.save(fullFilename);
            showToast(`PDF descargado: ${fullFilename}`, 'success');
        } catch (err) {
            console.error('Error exporting PDF:', err);
            showToast(`Error al generar PDF: ${err.message}`, 'error');
        }
    }

    /**
     * Copy table content to Clipboard (Tab delimited: Código \t Descripción)
     */
    function copyTableToClipboard(dataArray, label) {
        if (!dataArray || dataArray.length === 0) {
            showToast('No hay datos para copiar', 'warning');
            return;
        }

        const lines = [`Código Identificado\tDescripción`];
        dataArray.forEach(item => {
            lines.push(`${item.code}\t${item.desc}`);
        });

        const textToCopy = lines.join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast(`Reporte ${label} copiado al portapapeles (2 columnas)`, 'success');
        }).catch(err => {
            console.error('Clipboard error:', err);
            showToast('No se pudo copiar al portapapeles', 'error');
        });
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

})();
