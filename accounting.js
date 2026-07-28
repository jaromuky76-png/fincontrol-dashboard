/**
 * FinControl - Accounting & Labor Costing Module (Modo Contable)
 * 
 * Executive Features:
 * 1. Multi-month and annual historical data aggregation (COSTEO_HISTORY).
 * 2. Ranked from highest to lowest invoicing volume (De mayor a menor facturación).
 * 3. Interactive Chart.js visual analytics (Top 10 activities & Unit Distribution).
 * 4. Automatic Live Sync Polling (Auto-updates UI when datos_costeo.js updates).
 * 5. Interactive Modal for Active Catalogs (T49 & T39 inspector).
 */

(function () {

    // Active Catalogs State
    let maestrosCatalog = (typeof DEFAULT_MAESTROS_CATALOG !== 'undefined') ? { ...DEFAULT_MAESTROS_CATALOG } : {};
    let csCatalog = (typeof DEFAULT_CS_CATALOG !== 'undefined') ? { ...DEFAULT_CS_CATALOG } : {};

    // Current Active Display Results
    let currentPeriodKey = 'ALL';
    let currentResults = {
        periodLabel: '',
        totalSalesRows: 0,
        totalLaborRows: 0,
        maestrosMatches: [], // Sorted de mayor a menor: [{ code, desc, frequency }]
        csMatches: []        // Sorted de mayor a menor: [{ code, desc, frequency }]
    };

    // Chart Instances
    let chartTopActivities = null;
    let chartUnitDistribution = null;

    // Modal Active Tab State
    let activeModalTab = 'T49'; // 'T49' or 'T39'

    // DOM Elements Cache
    let elements = {};

    document.addEventListener('DOMContentLoaded', () => {
        initAccountingElements();
        initAccountingEvents();
        updateCatalogBadges();
        autoLoadCosteoHistory();
        initLiveSyncPolling();
    });

    function initAccountingElements() {
        elements = {
            // Catalogs UI & Modal
            badgeMaestrosCount: document.getElementById('badge-maestros-count'),
            badgeCsCount: document.getElementById('badge-cs-count'),
            btnManageCatalogs: document.getElementById('btn-manage-catalogs'),
            modalManageCatalogs: document.getElementById('modal-manage-catalogs'),
            btnCloseManageCatalogs: document.getElementById('btn-close-manage-catalogs'),
            btnDoneManageCatalogs: document.getElementById('btn-done-manage-catalogs'),
            modalMaestrosCount: document.getElementById('modal-maestros-count'),
            modalCsCount: document.getElementById('modal-cs-count'),
            btnCatalogTabT49: document.getElementById('btn-catalog-tab-t49'),
            btnCatalogTabT39: document.getElementById('btn-catalog-tab-t39'),
            searchModalCatalog: document.getElementById('search-modal-catalog'),
            tableModalCatalogBody: document.getElementById('table-modal-catalog-body'),

            // Period Selector
            selectPeriod: document.getElementById('select-accounting-period'),

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
        const mCount = Object.keys(maestrosCatalog).length;
        const csCount = Object.keys(csCatalog).length;

        if (elements.badgeMaestrosCount) elements.badgeMaestrosCount.textContent = `${mCount} códigos`;
        if (elements.badgeCsCount) elements.badgeCsCount.textContent = `${csCount} códigos`;

        if (elements.modalMaestrosCount) elements.modalMaestrosCount.textContent = `${mCount} códigos activos`;
        if (elements.modalCsCount) elements.modalCsCount.textContent = `${csCount} códigos activos`;
    }

    /**
     * Load & Populate Multi-Month History
     */
    function autoLoadCosteoHistory() {
        if (typeof COSTEO_HISTORY === 'undefined' || Object.keys(COSTEO_HISTORY).length === 0) {
            if (typeof COSTEO_DATA !== 'undefined' && COSTEO_DATA.maestrosMatches) {
                window.COSTEO_HISTORY = {
                    [COSTEO_DATA.monthTag || 'Actual']: COSTEO_DATA
                };
            } else {
                return;
            }
        }

        populatePeriodSelector();
        switchPeriod(currentPeriodKey);
    }

    function populatePeriodSelector() {
        if (!elements.selectPeriod) return;

        const months = Object.keys(COSTEO_HISTORY);
        const prevValue = elements.selectPeriod.value;
        elements.selectPeriod.innerHTML = '';

        if (months.length === 0) return;

        // Option 1: All Periods (Annual Cumulative)
        const optAll = document.createElement('option');
        optAll.value = 'ALL';
        optAll.textContent = `📊 Acumulado Anual (${months.length} ${months.length === 1 ? 'mes' : 'meses'})`;
        elements.selectPeriod.appendChild(optAll);

        // Individual Months (most recent first)
        months.sort((a, b) => b.localeCompare(a)).forEach(mTag => {
            const opt = document.createElement('option');
            opt.value = mTag;
            opt.textContent = `📅 Mes: ${mTag}`;
            elements.selectPeriod.appendChild(opt);
        });

        if (prevValue && (prevValue === 'ALL' || months.includes(prevValue))) {
            currentPeriodKey = prevValue;
        } else {
            currentPeriodKey = months.length > 1 ? 'ALL' : months[0];
        }

        elements.selectPeriod.value = currentPeriodKey;
    }

    function switchPeriod(periodKey) {
        currentPeriodKey = periodKey;

        if (periodKey === 'ALL') {
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
                periodLabel: 'Acumulado Anual',
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
        renderAccountingCharts();
    }

    function initAccountingEvents() {
        // Period Selector change event
        if (elements.selectPeriod) {
            elements.selectPeriod.addEventListener('change', (e) => {
                switchPeriod(e.target.value);
            });
        }

        // Manage Catalogs Modal Events
        if (elements.btnManageCatalogs) {
            elements.btnManageCatalogs.addEventListener('click', () => {
                updateCatalogBadges();
                renderModalCatalogTable();
                if (elements.modalManageCatalogs) elements.modalManageCatalogs.classList.add('active');
            });
        }

        [elements.btnCloseManageCatalogs, elements.btnDoneManageCatalogs].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    if (elements.modalManageCatalogs) elements.modalManageCatalogs.classList.remove('active');
                });
            }
        });

        if (elements.modalManageCatalogs) {
            elements.modalManageCatalogs.addEventListener('click', (e) => {
                if (e.target === elements.modalManageCatalogs) {
                    elements.modalManageCatalogs.classList.remove('active');
                }
            });
        }

        // Modal Tab Switcher
        if (elements.btnCatalogTabT49) {
            elements.btnCatalogTabT49.addEventListener('click', () => {
                activeModalTab = 'T49';
                elements.btnCatalogTabT49.className = 'btn btn-sm btn-primary';
                if (elements.btnCatalogTabT39) elements.btnCatalogTabT39.className = 'btn btn-sm btn-secondary';
                renderModalCatalogTable();
            });
        }

        if (elements.btnCatalogTabT39) {
            elements.btnCatalogTabT39.addEventListener('click', () => {
                activeModalTab = 'T39';
                elements.btnCatalogTabT39.className = 'btn btn-sm btn-primary';
                if (elements.btnCatalogTabT49) elements.btnCatalogTabT49.className = 'btn btn-sm btn-secondary';
                renderModalCatalogTable();
            });
        }

        if (elements.searchModalCatalog) {
            elements.searchModalCatalog.addEventListener('input', () => renderModalCatalogTable());
        }

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

    /**
     * Render Active Catalog Table inside Modal
     */
    function renderModalCatalogTable() {
        const tbody = elements.tableModalCatalogBody;
        if (!tbody) return;
        tbody.innerHTML = '';

        const catSource = activeModalTab === 'T49' ? maestrosCatalog : csCatalog;
        const searchTerm = (elements.searchModalCatalog ? elements.searchModalCatalog.value.toLowerCase().trim() : '');

        const entries = Object.entries(catSource).filter(([code, desc]) =>
            code.toLowerCase().includes(searchTerm) ||
            desc.toLowerCase().includes(searchTerm)
        );

        if (entries.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="2" class="text-center text-muted" style="padding: 1.5rem;">
                        No se encontraron códigos en el catálogo ${activeModalTab === 'T49' ? 'Taller Maestro' : 'Centro de Servicios'}
                    </td>
                </tr>
            `;
            return;
        }

        entries.forEach(([code, desc]) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600; font-family: monospace; color: ${activeModalTab === 'T49' ? 'var(--color-primary)' : 'var(--color-success)'}; white-space: nowrap;">
                    ${escapeHtml(code)}
                </td>
                <td style="font-size: 0.85rem;">
                    ${escapeHtml(desc)}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    /**
     * Render KPIs and Consolidated Tables (Sorted DE MAYOR A MENOR)
     */
    function renderAccountingResults() {
        if (elements.panelResults) elements.panelResults.classList.remove('hidden');

        // Update KPIs
        const totalDistinctCodes = currentResults.maestrosMatches.length + currentResults.csMatches.length;
        if (elements.kpiTotalIdentified) elements.kpiTotalIdentified.textContent = totalDistinctCodes.toLocaleString();
        if (elements.kpiMaestrosCodes) elements.kpiMaestrosCodes.textContent = currentResults.maestrosMatches.length.toLocaleString();
        if (elements.kpiCsCodes) elements.kpiCsCodes.textContent = currentResults.csMatches.length.toLocaleString();
        if (elements.kpiTotalOccurrences) elements.kpiTotalOccurrences.textContent = currentResults.totalLaborRows.toLocaleString();

        // Render Tables
        renderMaestrosTable();
        renderCsTable();
    }

    /**
     * Render Interactive Chart.js Visual Analytics
     */
    function renderAccountingCharts() {
        if (typeof Chart === 'undefined') return;

        // 1. Top 10 Activities Horizontal Bar Chart
        const topCanvas = document.getElementById('chart-top-activities');
        if (topCanvas) {
            const combinedList = [
                ...currentResults.maestrosMatches.map(i => ({ label: `${i.desc} (T49)`, val: i.frequency, type: 'T49' })),
                ...currentResults.csMatches.map(i => ({ label: `${i.desc} (T39)`, val: i.frequency, type: 'T39' }))
            ].sort((a, b) => b.val - a.val).slice(0, 8);

            const labels = combinedList.map(i => i.label.length > 32 ? i.label.substring(0, 30) + '...' : i.label);
            const dataVals = combinedList.map(i => i.val);
            const bgColors = combinedList.map(i => i.type === 'T49' ? 'rgba(14, 165, 233, 0.85)' : 'rgba(16, 185, 129, 0.85)');

            if (chartTopActivities) chartTopActivities.destroy();

            chartTopActivities = new Chart(topCanvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Facturaciones en el Periodo',
                        data: dataVals,
                        backgroundColor: bgColors,
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return ` Facturaciones: ${context.parsed.x}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 10 } }
                        },
                        y: {
                            grid: { display: false },
                            ticks: { color: 'rgba(255, 255, 255, 0.85)', font: { size: 10, weight: '600' } }
                        }
                    }
                }
            });
        }

        // 2. Unit Distribution Doughnut Chart
        const unitCanvas = document.getElementById('chart-unit-distribution');
        if (unitCanvas) {
            const mTotal = currentResults.maestrosMatches.reduce((a, b) => a + b.frequency, 0);
            const csTotal = currentResults.csMatches.reduce((a, b) => a + b.frequency, 0);

            if (chartUnitDistribution) chartUnitDistribution.destroy();

            chartUnitDistribution = new Chart(unitCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['Taller Maestro (T49)', 'Centro de Servicios (T39)'],
                    datasets: [{
                        data: [mTotal, csTotal],
                        backgroundColor: ['rgba(14, 165, 233, 0.85)', 'rgba(16, 185, 129, 0.85)'],
                        borderColor: 'transparent',
                        hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: 'rgba(255, 255, 255, 0.85)', font: { size: 11, weight: '600' } }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    const total = mTotal + csTotal;
                                    const val = context.parsed;
                                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                    return ` ${context.label}: ${val} facturaciones (${pct}%)`;
                                }
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }
    }

    /**
     * Render Maestros T49 Table (De Mayor a Menor Facturación with Rank Badges)
     */
    function renderMaestrosTable() {
        const tbody = elements.tableMaestrosBody;
        if (!tbody) return;
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
        if (!tbody) return;
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
     * Live Polling Sync (Auto-detects data updates without browser refresh)
     */
    function initLiveSyncPolling() {
        setInterval(() => {
            const scriptTag = document.querySelector('script[src*="datos_costeo.js"]');
            if (scriptTag) {
                const newScript = document.createElement('script');
                newScript.src = `datos_costeo.js?t=${Date.now()}`;
                newScript.onload = () => {
                    if (typeof COSTEO_HISTORY !== 'undefined') {
                        autoLoadCosteoHistory();
                    }
                    newScript.remove();
                };
                document.body.appendChild(newScript);
            }
        }, 12000);
    }

    /**
     * Export consolidated codes to Excel (.xlsx)
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
     * Export consolidated codes to PDF
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
     * Copy table content to Clipboard
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
