/**
 * FinControl - Accounting & Labor Costing Module (Modo Contable)
 * 
 * Features:
 * 1. Multi-month and annual historical data aggregation (COSTEO_HISTORY).
 * 2. Ranked from highest to lowest invoicing volume (De mayor a menor facturación).
 * 3. Interactive Period Filter (Selección por Mes o Acumulado Anual).
 * 4. Executive Decision-Making Highlights (Top Facturados vs Baja Facturación).
 */

(function () {

    // Active Catalogs State
    let maestrosCatalog = (typeof DEFAULT_MAESTROS_CATALOG !== 'undefined') ? { ...DEFAULT_MAESTROS_CATALOG } : {};
    let csCatalog = (typeof DEFAULT_CS_CATALOG !== 'undefined') ? { ...DEFAULT_CS_CATALOG } : {};

    // Current Active Display Results
    let currentPeriodKey = 'ALL'; // 'ALL' or specific month tag e.g. 'Junio 2026'
    let currentResults = {
        periodLabel: '',
        totalSalesRows: 0,
        totalLaborRows: 0,
        maestrosMatches: [], // Sorted de mayor a menor: [{ code, desc, frequency }]
        csMatches: []        // Sorted de mayor a menor: [{ code, desc, frequency }]
    };

    // DOM Elements Cache
    let elements = {};

    document.addEventListener('DOMContentLoaded', () => {
        initAccountingElements();
        initAccountingEvents();
        updateCatalogBadges();
        autoLoadCosteoHistory();
    });

    function initAccountingElements() {
        elements = {
            // Catalogs UI
            badgeMaestrosCount: document.getElementById('badge-maestros-count'),
            badgeCsCount: document.getElementById('badge-cs-count'),

            // Period Selector
            selectPeriod: document.getElementById('select-accounting-period'),

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

    /**
     * Load & Populate Multi-Month History
     */
    function autoLoadCosteoHistory() {
        if (typeof COSTEO_HISTORY === 'undefined' || Object.keys(COSTEO_HISTORY).length === 0) {
            if (typeof COSTEO_DATA !== 'undefined' && COSTEO_DATA.maestrosMatches) {
                // Fallback single payload
                window.COSTEO_HISTORY = {
                    [COSTEO_DATA.monthTag || 'Actual']: COSTEO_DATA
                };
            } else {
                return;
            }
        }

        populatePeriodSelector();
        switchPeriod('ALL');
    }

    function populatePeriodSelector() {
        if (!elements.selectPeriod) return;

        const months = Object.keys(COSTEO_HISTORY);
        elements.selectPeriod.innerHTML = '';

        if (months.length === 0) return;

        // Option 1: All Periods (Annual Cumulative)
        const optAll = document.createElement('option');
        optAll.value = 'ALL';
        optAll.textContent = `📊 Acumulado Anual / Todos (${months.length} ${months.length === 1 ? 'mes' : 'meses'})`;
        elements.selectPeriod.appendChild(optAll);

        // Individual Months (most recent first)
        months.sort((a, b) => b.localeCompare(a)).forEach(mTag => {
            const opt = document.createElement('option');
            opt.value = mTag;
            opt.textContent = `📅 Mes: ${mTag}`;
            elements.selectPeriod.appendChild(opt);
        });

        // Set default to Most Recent Month or ALL if multiple
        currentPeriodKey = months.length > 1 ? 'ALL' : months[0];
        elements.selectPeriod.value = currentPeriodKey;
    }

    function switchPeriod(periodKey) {
        currentPeriodKey = periodKey;

        if (periodKey === 'ALL') {
            // Aggregate all stored months
            const maestrosAgg = {};
            const csAgg = {};
            let grandSales = 0;
            let grandLabor = 0;

            Object.values(COSTEO_HISTORY).forEach(monthData => {
                grandSales += (monthData.totalSalesRows || 0);
                grandLabor += (monthData.totalLaborRows || 0);

                (monthData.maestrosMatches || []).forEach(item => {
                    if (!maestrosAgg[item.code]) {
                        maestrosAgg[item.code] = { code: item.code, desc: item.desc, frequency: 0 };
                    }
                    maestrosAgg[item.code].frequency += item.frequency;
                });

                (monthData.csMatches || []).forEach(item => {
                    if (!csAgg[item.code]) {
                        csAgg[item.code] = { code: item.code, desc: item.desc, frequency: 0 };
                    }
                    csAgg[item.code].frequency += item.frequency;
                });
            });

            // Sort DE MAYOR A MENOR (Highest frequency first)
            const mSorted = Object.values(maestrosAgg).sort((a, b) => b.frequency - a.frequency);
            const csSorted = Object.values(csAgg).sort((a, b) => b.frequency - a.frequency);

            currentResults = {
                periodLabel: 'Acumulado Anual (Todos los Meses)',
                totalSalesRows: grandSales,
                totalLaborRows: grandLabor,
                maestrosMatches: mSorted,
                csMatches: csSorted
            };

        } else if (COSTEO_HISTORY[periodKey]) {
            const mData = COSTEO_HISTORY[periodKey];

            // Sort DE MAYOR A MENOR
            const mSorted = [...(mData.maestrosMatches || [])].sort((a, b) => b.frequency - a.frequency);
            const csSorted = [...(mData.csMatches || [])].sort((a, b) => b.frequency - a.frequency);

            currentResults = {
                periodLabel: `Mes de ${mData.monthTag}`,
                totalSalesRows: mData.totalSalesRows || 0,
                totalLaborRows: mData.totalLaborRows || 0,
                maestrosMatches: mSorted,
                csMatches: csSorted
            };
        }

        renderAccountingResults();
    }

    function initAccountingEvents() {
        if (!elements.inputSalesFile || !elements.dropZoneSales) return;

        // Period Selector change event
        if (elements.selectPeriod) {
            elements.selectPeriod.addEventListener('change', (e) => {
                switchPeriod(e.target.value);
            });
        }

        // Click on dropzone triggers file picker
        elements.dropZoneSales.addEventListener('click', (e) => {
            if (e.target !== elements.inputSalesFile) {
                elements.inputSalesFile.click();
            }
        });

        // Drag & Drop handlers
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
                processSalesExcelFile(file);
            }
        });

        // File Selection Listener
        elements.inputSalesFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleSalesFileSelection(file);
                processSalesExcelFile(file);
            }
        });

        // Process Button Listener
        elements.btnProcessAccounting.addEventListener('click', (e) => {
            e.stopPropagation();
            const file = elements.inputSalesFile.files[0];
            if (file) {
                processSalesExcelFile(file);
            } else {
                showToast('Por favor selecciona un archivo Excel', 'warning');
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
        showToast(`Archivo "${file.name}" cargado.`, 'info');
        return true;
    }

    function resetAccountingForm() {
        elements.inputSalesFile.value = '';
        elements.salesFileInfo.textContent = 'Ningún archivo seleccionado';
        elements.btnProcessAccounting.disabled = true;
        elements.panelProgress.classList.add('hidden');
        elements.panelResults.classList.add('hidden');
        elements.btnClearAccounting.classList.add('hidden');
        showToast('Vista de costeo reiniciada', 'info');
    }

    function updateProgress(percent, text) {
        if (elements.panelProgress) elements.panelProgress.classList.remove('hidden');
        if (elements.progressBar) elements.progressBar.style.width = `${percent}%`;
        if (elements.progressText) elements.progressText.textContent = text;
    }

    /**
     * Browser direct File Processor
     */
    async function processSalesExcelFile(file) {
        if (!file) return;

        elements.btnProcessAccounting.disabled = true;
        updateProgress(20, 'Leyendo datos del archivo Excel...');

        setTimeout(() => {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb = XLSX.read(data, { type: 'array' });

                    const sheetM = wb.Sheets['Taller Maestro (T49)'] || wb.Sheets[wb.SheetNames[0]];
                    const sheetCS = wb.Sheets['Centro de Servicios (T39)'] || wb.Sheets[wb.SheetNames[1]];

                    let mMatches = [];
                    let csMatches = [];

                    if (sheetM) {
                        const jsonM = XLSX.utils.sheet_to_json(sheetM);
                        const mDict = {};
                        jsonM.forEach(r => {
                            const c = String(r['Código Identificado'] || r['Código'] || '').trim();
                            const d = String(r['Descripción de la Actividad'] || r['Descripción'] || '').trim();
                            if (c) {
                                if (!mDict[c]) mDict[c] = { code: c, desc: d, frequency: 0 };
                                mDict[c].frequency++;
                            }
                        });
                        // Sort DE MAYOR A MENOR
                        mMatches = Object.values(mDict).sort((a, b) => b.frequency - a.frequency);
                    }

                    if (sheetCS) {
                        const jsonCS = XLSX.utils.sheet_to_json(sheetCS);
                        const csDict = {};
                        jsonCS.forEach(r => {
                            const c = String(r['Código Identificado'] || r['Código'] || '').trim();
                            const d = String(r['Descripción de la Actividad'] || r['Descripción'] || '').trim();
                            if (c) {
                                if (!csDict[c]) csDict[c] = { code: c, desc: d, frequency: 0 };
                                csDict[c].frequency++;
                            }
                        });
                        // Sort DE MAYOR A MENOR
                        csMatches = Object.values(csDict).sort((a, b) => b.frequency - a.frequency);
                    }

                    const totalLabor = mMatches.reduce((a, b) => a + b.frequency, 0) + csMatches.reduce((a, b) => a + b.frequency, 0);
                    const monthTag = file.name.replace(/Consolidado de ventas/i, '').replace(/\.xlsx$/i, '').trim() || 'Nuevo Mes';

                    const monthData = {
                        fileName: file.name,
                        monthTag: monthTag,
                        processedAt: new Date().toISOString(),
                        totalSalesRows: totalLabor,
                        totalLaborRows: totalLabor,
                        maestrosMatches: mMatches,
                        csMatches: csMatches
                    };

                    if (typeof COSTEO_HISTORY === 'undefined') window.COSTEO_HISTORY = {};
                    COSTEO_HISTORY[monthTag] = monthData;

                    populatePeriodSelector();
                    elements.selectPeriod.value = monthTag;
                    switchPeriod(monthTag);

                    updateProgress(100, 'Procesamiento completado.');

                    setTimeout(() => {
                        elements.panelProgress.classList.add('hidden');
                    }, 300);

                } catch (err) {
                    console.error('Error parsing file:', err);
                    elements.panelProgress.classList.add('hidden');
                    elements.btnProcessAccounting.disabled = false;
                    showToast(`Error al procesar: ${err.message}`, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        }, 50);
    }

    /**
     * Render KPIs and Consolidated Tables (Sorted DE MAYOR A MENOR)
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

        // Render Tables (De Mayor a Menor)
        renderMaestrosTable();
        renderCsTable();

        showToast(`Periodo "${currentResults.periodLabel}": ${currentResults.maestrosMatches.length} códigos en Maestros y ${currentResults.csMatches.length} en Centro de Servicios`, 'success');
    }

    /**
     * Render Maestros T49 Table (De Mayor a Menor Facturación with Rank Badges)
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
            elements.countMaestrosTable.textContent = `${filtered.length} de ${currentResults.maestrosMatches.length} códigos identificados`;
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

        filtered.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            // Rank highlight badge for top 3
            let rankBadge = '';
            if (index === 0) rankBadge = '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; margin-right: 0.5rem; font-weight: 700;">#1 🔥</span>';
            else if (index === 1) rankBadge = '<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; margin-right: 0.5rem; font-weight: 700;">#2 ⭐️</span>';
            else if (index === 2) rankBadge = '<span class="badge" style="background: rgba(14, 165, 233, 0.2); color: #0ea5e9; border: 1px solid #0ea5e9; margin-right: 0.5rem; font-weight: 700;">#3 ⚡️</span>';
            else rankBadge = `<span class="badge" style="background: var(--bg-hover); color: var(--text-muted); margin-right: 0.5rem; font-size: 0.75rem;">#${index + 1}</span>`;

            tr.innerHTML = `
                <td style="font-weight: 600; font-family: monospace; color: var(--color-primary); white-space: nowrap;">
                    ${rankBadge}${escapeHtml(item.code)}
                </td>
                <td>
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                        <span style="font-weight: ${index < 3 ? '600' : 'normal'};">${escapeHtml(item.desc)}</span>
                        <span class="badge-freq" style="font-weight: 700; ${index === 0 ? 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444;' : ''}" title="${item.frequency} facturaciones en el periodo">${item.frequency} facturaciones</span>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Render Centro de Servicios T39 Table (De Mayor a Menor Facturación with Rank Badges)
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
            elements.countCsTable.textContent = `${filtered.length} de ${currentResults.csMatches.length} códigos identificados`;
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

        filtered.forEach((item, index) => {
            const tr = document.createElement('tr');

            // Rank highlight badge for top 3
            let rankBadge = '';
            if (index === 0) rankBadge = '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; margin-right: 0.5rem; font-weight: 700;">#1 🔥</span>';
            else if (index === 1) rankBadge = '<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; margin-right: 0.5rem; font-weight: 700;">#2 ⭐️</span>';
            else if (index === 2) rankBadge = '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981; margin-right: 0.5rem; font-weight: 700;">#3 ⚡️</span>';
            else rankBadge = `<span class="badge" style="background: var(--bg-hover); color: var(--text-muted); margin-right: 0.5rem; font-size: 0.75rem;">#${index + 1}</span>`;

            tr.innerHTML = `
                <td style="font-weight: 600; font-family: monospace; color: var(--color-success); white-space: nowrap;">
                    ${rankBadge}${escapeHtml(item.code)}
                </td>
                <td>
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                        <span style="font-weight: ${index < 3 ? '600' : 'normal'};">${escapeHtml(item.desc)}</span>
                        <span class="badge-freq badge-cs" style="font-weight: 700; ${index === 0 ? 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444;' : ''}" title="${item.frequency} facturaciones en el periodo">${item.frequency} facturaciones</span>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Export consolidated codes to Excel (.xlsx) sorted DE MAYOR A MENOR
     */
    function exportToExcel(filenamePrefix, dataArray, sheetTitle) {
        if (!dataArray || dataArray.length === 0) {
            showToast('No hay datos para exportar', 'warning');
            return;
        }

        try {
            const exportData = dataArray.map((item, idx) => ({
                'Ranking': idx + 1,
                'Código Identificado': item.code,
                'Descripción de la Actividad': item.desc,
                'Facturaciones (Frecuencia)': item.frequency
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            ws['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 65 }, { wch: 25 }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Mano de Obra');

            const periodTag = currentResults.periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fullFilename = `Consolidado_${filenamePrefix}_${periodTag}.xlsx`;

            XLSX.writeFile(wb, fullFilename);
            showToast(`Reporte descargado: ${fullFilename}`, 'success');
        } catch (err) {
            console.error('Error exporting to Excel:', err);
            showToast(`Error al exportar a Excel: ${err.message}`, 'error');
        }
    }

    /**
     * Export consolidated codes to PDF sorted DE MAYOR A MENOR
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

            doc.setFontSize(15);
            doc.setTextColor(14, 165, 233);
            doc.text(documentTitle, 14, 18);

            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(`Periodo: ${currentResults.periodLabel}`, 14, 25);
            doc.text(`Orden: De Mayor a Menor Facturación | Total Códigos: ${dataArray.length}`, 14, 30);

            const tableRows = dataArray.map((item, idx) => [`#${idx + 1}`, item.code, item.desc, `${item.frequency}`]);

            doc.autoTable({
                startY: 35,
                head: [['Rank', 'Código Identificado', 'Descripción de la Actividad', 'Facturaciones']],
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
                    0: { cellWidth: 15, fontStyle: 'bold' },
                    1: { cellWidth: 35, fontStyle: 'bold' },
                    2: { cellWidth: 'auto' },
                    3: { cellWidth: 30, fontStyle: 'bold', halign: 'right' }
                }
            });

            const periodTag = currentResults.periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fullFilename = `Consolidado_${filenamePrefix}_${periodTag}.pdf`;

            doc.save(fullFilename);
            showToast(`PDF descargado: ${fullFilename}`, 'success');
        } catch (err) {
            console.error('Error exporting PDF:', err);
            showToast(`Error al generar PDF: ${err.message}`, 'error');
        }
    }

    /**
     * Copy table content to Clipboard (Tab delimited: Code \t Desc \t Freq)
     */
    function copyTableToClipboard(dataArray, label) {
        if (!dataArray || dataArray.length === 0) {
            showToast('No hay datos para copiar', 'warning');
            return;
        }

        const lines = [`Rank\tCódigo Identificado\tDescripción\tFacturaciones`];
        dataArray.forEach((item, idx) => {
            lines.push(`#${idx + 1}\t${item.code}\t${item.desc}\t${item.frequency}`);
        });

        const textToCopy = lines.join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast(`Consolidado ${label} copiado al portapapeles (Ordenado mayor a menor)`, 'success');
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
