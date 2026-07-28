/**
 * FinControl - Accounting & Labor Costing Module (Modo Contable)
 * Processes monthly sales consolidated Excel spreadsheets ("Consolidado de Ventas"),
 * identifies labor codes for Taller Maestro (T49) and Centro de Servicios (T39),
 * and generates 2-column reports (Código Identificado y Descripción).
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
            inputCustomMaestros: document.getElementById('input-custom-maestros'),
            inputCustomCs: document.getElementById('input-custom-cs'),

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
        if (!elements.inputSalesFile) return;

        // File Selection Listener
        elements.inputSalesFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleSalesFileSelection(file);
            }
        });

        // Process Button Listener
        elements.btnProcessAccounting.addEventListener('click', () => {
            const file = elements.inputSalesFile.files[0];
            if (file) {
                processSalesExcelFile(file);
            } else {
                showToast('Por favor selecciona un archivo de Consolidado de Ventas (.xlsx)', 'warning');
            }
        });

        // Clear Button Listener
        elements.btnClearAccounting.addEventListener('click', () => {
            resetAccountingForm();
        });

        // Search Filters
        if (elements.searchMaestros) {
            elements.searchMaestros.addEventListener('input', () => {
                renderMaestrosTable();
            });
        }
        if (elements.searchCs) {
            elements.searchCs.addEventListener('input', () => {
                renderCsTable();
            });
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

        // Optional custom catalog file inputs
        if (elements.inputCustomMaestros) {
            elements.inputCustomMaestros.addEventListener('change', (e) => loadCustomCatalog(e.target.files[0], 'maestros'));
        }
        if (elements.inputCustomCs) {
            elements.inputCustomCs.addEventListener('change', (e) => loadCustomCatalog(e.target.files[0], 'cs'));
        }
    }

    function handleSalesFileSelection(file) {
        if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
            showToast('Formato no válido. Por favor sube un archivo Excel (.xlsx)', 'error');
            elements.salesFileInfo.textContent = 'Archivo no válido';
            elements.btnProcessAccounting.disabled = true;
            return;
        }

        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        elements.salesFileInfo.textContent = `${file.name} (${sizeMb} MB)`;
        elements.btnProcessAccounting.disabled = false;
        showToast(`Archivo "${file.name}" seleccionado`, 'info');
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

    /**
     * Process Sales Excel File using SheetJS / XLSX library
     */
    function processSalesExcelFile(file) {
        if (typeof XLSX === 'undefined') {
            showToast('Error: Librería de lectura Excel (SheetJS) no disponible.', 'error');
            return;
        }

        elements.panelProgress.classList.remove('hidden');
        elements.progressText.textContent = 'Leyendo archivo Excel y analizando sábana de ventas...';
        elements.progressBar.style.width = '20%';
        elements.btnProcessAccounting.disabled = true;

        setTimeout(() => {
            const reader = new FileReader();

            reader.onload = function (e) {
                try {
                    elements.progressText.textContent = 'Decodificando estructura de hoja "Ventas"...';
                    elements.progressBar.style.width = '40%';

                    const data = new Uint8Array(e.target.result);
                    
                    // Parse workbook. Try loading only sheet 'Ventas' for maximum performance
                    let wb;
                    try {
                        wb = XLSX.read(data, { type: 'array', sheets: ['Ventas', 'ventas', 'VENTAS'] });
                    } catch (err) {
                        wb = XLSX.read(data, { type: 'array' });
                    }

                    let targetSheetName = wb.SheetNames.find(s => s.trim().toLowerCase() === 'ventas');
                    if (!targetSheetName) {
                        targetSheetName = wb.SheetNames[0];
                    }

                    const ws = wb.Sheets[targetSheetName];
                    if (!ws) {
                        throw new Error(`No se encontró la hoja "Ventas" en el archivo.`);
                    }

                    elements.progressText.textContent = 'Filtrando códigos de mano de obra en Columna Q (ProductID)...';
                    elements.progressBar.style.width = '70%';

                    // Convert Sheet to array of rows
                    const sheetRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
                    
                    if (sheetRows.length < 2) {
                        throw new Error('La hoja "Ventas" está vacía o no contiene datos.');
                    }

                    // Find Column Q index (default index 16 for Q, or look for ProductID header in row 0)
                    let colQIndex = 16;
                    const headerRow = sheetRows[0] || [];
                    for (let c = 0; c < headerRow.length; c++) {
                        const hVal = String(headerRow[c] || '').trim().toLowerCase();
                        if (hVal === 'productid' || hVal === 'codigo' || hVal === 'código' || hVal === 'rms') {
                            colQIndex = c;
                            break;
                        }
                    }

                    // Aggregators for matched codes
                    const maestrosFound = {}; // code -> { code, desc, count }
                    const csFound = {};       // code -> { code, desc, count }

                    let totalRowsProcessed = 0;
                    let totalLaborOccurrences = 0;

                    for (let i = 1; i < sheetRows.length; i++) {
                        const row = sheetRows[i];
                        if (!row) continue;
                        totalRowsProcessed++;

                        let rawCode = row[colQIndex];
                        if (rawCode === null || rawCode === undefined || rawCode === '') continue;

                        let codeStr = String(rawCode).trim();
                        if (codeStr.endsWith('.0')) {
                            codeStr = codeStr.slice(0, -2);
                        }

                        // Check match in Maestros catalog
                        if (maestrosCatalog[codeStr] !== undefined) {
                            totalLaborOccurrences++;
                            if (!maestrosFound[codeStr]) {
                                maestrosFound[codeStr] = {
                                    code: codeStr,
                                    desc: maestrosCatalog[codeStr],
                                    frequency: 0
                                };
                            }
                            maestrosFound[codeStr].frequency++;
                        }

                        // Check match in Centro de Servicios catalog
                        if (csCatalog[codeStr] !== undefined) {
                            totalLaborOccurrences++;
                            if (!csFound[codeStr]) {
                                csFound[codeStr] = {
                                    code: codeStr,
                                    desc: csCatalog[codeStr],
                                    frequency: 0
                                };
                            }
                            csFound[codeStr].frequency++;
                        }
                    }

                    elements.progressBar.style.width = '100%';
                    elements.progressText.textContent = 'Procesamiento completado con éxito.';

                    // Store results
                    currentResults = {
                        fileName: file.name,
                        totalSalesRows: totalRowsProcessed,
                        totalLaborRows: totalLaborOccurrences,
                        maestrosMatches: Object.values(maestrosFound).sort((a, b) => a.desc.localeCompare(b.desc)),
                        csMatches: Object.values(csFound).sort((a, b) => a.desc.localeCompare(b.desc))
                    };

                    setTimeout(() => {
                        elements.panelProgress.classList.add('hidden');
                        renderAccountingResults();
                    }, 500);

                } catch (err) {
                    console.error('Error processing sales Excel file:', err);
                    elements.panelProgress.classList.add('hidden');
                    elements.btnProcessAccounting.disabled = false;
                    showToast(`Error al procesar archivo: ${err.message}`, 'error');
                }
            };

            reader.readAsArrayBuffer(file);
        }, 100);
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
            lucide.createIcons();
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

        lucide.createIcons();
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
            lucide.createIcons();
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

        lucide.createIcons();
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
            // Prepare clean 2-column data format requested by user
            const exportData = dataArray.map(item => ({
                'Código Identificado': item.code,
                'Descripción': item.desc,
                'Facturaciones (Frecuencia)': item.frequency
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            
            // Adjust column widths
            ws['!cols'] = [
                { wch: 22 }, // Code
                { wch: 65 }, // Desc
                { wch: 25 }  // Freq
            ];

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

            // Title and Metadata Header
            doc.setFontSize(16);
            doc.setTextColor(14, 165, 233); // Primary theme color
            doc.text(documentTitle, 14, 18);

            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(`Archivo Sábana: ${currentResults.fileName || 'Consolidado de Ventas'}`, 14, 25);
            doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-ES')} | Total códigos: ${dataArray.length}`, 14, 30);

            // Table Rows (2 main columns: Código Identificado y Descripción)
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

    /**
     * Optional: Load custom/updated catalog Excel file
     */
    function loadCustomCatalog(file, unit) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

                const newCatalog = {};
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || row[0] === null || row[0] === undefined) continue;
                    let cStr = String(row[0]).trim();
                    if (cStr.endsWith('.0')) cStr = cStr.slice(0, -2);
                    if (cStr.toLowerCase().includes('código') || cStr.toLowerCase().includes('codigo')) continue;
                    const descStr = row[1] ? String(row[1]).trim() : '';
                    newCatalog[cStr] = descStr;
                }

                if (unit === 'maestros') {
                    maestrosCatalog = newCatalog;
                    showToast(`Catálogo Maestros actualizado: ${Object.keys(maestrosCatalog).length} códigos`, 'success');
                } else {
                    csCatalog = newCatalog;
                    showToast(`Catálogo CS actualizado: ${Object.keys(csCatalog).length} códigos`, 'success');
                }

                updateCatalogBadges();
            } catch (err) {
                showToast(`Error al leer archivo de catálogo: ${err.message}`, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
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
