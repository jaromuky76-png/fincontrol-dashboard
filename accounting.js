/**
 * FinControl - Modo Contable v2.0
 *
 * Dashboard ejecutivo de Costos de Servicios Post Ventas.
 * Lee datos_reporte_contable.js (generado por el orquestador Python).
 *
 * Sub-pestañas:
 *  - RESUMEN: KPIs globales + gráfico de distribución por unidad de negocio
 *  - MAESTROS Interno: tabla CECO + USD + gráfico donut CECO + barras actividades
 *  - MAESTROS Externo: tabla facturas + USD + gráfico top servicios
 *  - CS Interno: tabla CECO + USD + gráfico donut CECO + barras actividades
 *  - CS Externo: tabla facturas + USD + gráfico top servicios
 */

(function () {
    'use strict';

    // ─── Estado global del módulo ──────────────────────────────────────────
    let activeTab = 'resumen';   // 'resumen' | 'maestros-int' | 'maestros-ext' | 'cs-int' | 'cs-ext'
    let data = null;             // Objeto window.REPORTE_CONTABLE_DATA
    let searchTerms = { 'maestros-int': '', 'maestros-ext': '', 'cs-int': '', 'cs-ext': '' };

    // Chart instances
    let charts = {};

    // Color palette
    const COLORS = {
        maestros:  { solid: 'rgba(14,165,233,0.85)',  border: 'rgba(14,165,233,1)',  light: 'rgba(14,165,233,0.15)' },
        cs:        { solid: 'rgba(16,185,129,0.85)',  border: 'rgba(16,185,129,1)',  light: 'rgba(16,185,129,0.15)' },
        secondary: { solid: 'rgba(121,40,202,0.85)',  border: 'rgba(121,40,202,1)',  light: 'rgba(121,40,202,0.15)' },
        warning:   { solid: 'rgba(251,191,36,0.85)',  border: 'rgba(251,191,36,1)',  light: 'rgba(251,191,36,0.15)' },
        palette: [
            'rgba(14,165,233,0.85)', 'rgba(16,185,129,0.85)', 'rgba(121,40,202,0.85)',
            'rgba(251,191,36,0.85)', 'rgba(239,68,68,0.85)',  'rgba(236,72,153,0.85)',
            'rgba(99,102,241,0.85)', 'rgba(6,182,212,0.85)',  'rgba(245,158,11,0.85)',
            'rgba(34,197,94,0.85)'
        ]
    };

    // ─── Inicialización ────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        initTabEvents();
        initSearchEvents();
        tryLoadData();
        initLivePolling();

        // Re-render when switching to Modo Contable view from sidebar
        const menuAcc = document.getElementById('menu-accounting');
        if (menuAcc) {
            menuAcc.addEventListener('click', () => {
                setTimeout(() => {
                    if (data) renderAll();
                    else tryLoadData();
                }, 50);
            });
        }

        // Re-render charts on Theme Toggle (Dark/Light mode switch)
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                setTimeout(() => {
                    if (data) renderChartsForTab(activeTab);
                }, 100);
            });
        }
    });

    function tryLoadData() {
        if (typeof window.REPORTE_CONTABLE_DATA !== 'undefined') {
            data = window.REPORTE_CONTABLE_DATA;
            renderAll();
        } else {
            renderEmptyState();
        }
    }

    // ─── Tab Navigation ────────────────────────────────────────────────────
    function initTabEvents() {
        const tabMap = {
            'acc-tab-resumen':       'resumen',
            'acc-tab-maestros-int':  'maestros-int',
            'acc-tab-maestros-ext':  'maestros-ext',
            'acc-tab-cs-int':        'cs-int',
            'acc-tab-cs-ext':        'cs-ext',
        };

        Object.entries(tabMap).forEach(([btnId, tabKey]) => {
            const btn = document.getElementById(btnId);
            if (btn) btn.addEventListener('click', () => switchTab(tabKey));
        });
    }

    function switchTab(tabKey) {
        activeTab = tabKey;

        // Update tab buttons
        document.querySelectorAll('.acc-tab-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`acc-tab-${tabKey}`);
        if (activeBtn) activeBtn.classList.add('active');

        // Show/hide panels
        document.querySelectorAll('.acc-panel').forEach(panel => panel.classList.add('hidden'));
        const activePanel = document.getElementById(`acc-panel-${tabKey}`);
        if (activePanel) activePanel.classList.remove('hidden');

        // Render charts for the active tab
        if (data) renderChartsForTab(tabKey);
    }

    // ─── Search Events ─────────────────────────────────────────────────────
    function initSearchEvents() {
        const searchMap = {
            'acc-search-maestros-int': 'maestros-int',
            'acc-search-maestros-ext': 'maestros-ext',
            'acc-search-cs-int':       'cs-int',
            'acc-search-cs-ext':       'cs-ext',
        };
        Object.entries(searchMap).forEach(([inputId, tabKey]) => {
            const el = document.getElementById(inputId);
            if (el) el.addEventListener('input', (e) => {
                searchTerms[tabKey] = e.target.value.toLowerCase().trim();
                renderTableForTab(tabKey);
            });
        });

        // Export buttons
        const exportMap = {
            'acc-btn-export-maestros-int': () => exportTableExcel('maestros-int', 'MAESTROS_Interno'),
            'acc-btn-export-maestros-ext': () => exportTableExcel('maestros-ext', 'MAESTROS_Externo'),
            'acc-btn-export-cs-int':       () => exportTableExcel('cs-int',       'CS_Interno'),
            'acc-btn-export-cs-ext':       () => exportTableExcel('cs-ext',       'CS_Externo'),
            'acc-btn-pdf-maestros-int':    () => exportTablePDF('maestros-int', 'MAESTROS — Interno', 'Costeo de Mano de Obra - Clientes Internos'),
            'acc-btn-pdf-maestros-ext':    () => exportTablePDF('maestros-ext', 'MAESTROS — Externo', 'Servicios Facturados - Clientes Externos'),
            'acc-btn-pdf-cs-int':          () => exportTablePDF('cs-int',       'CS — Interno',       'Costeo de Mano de Obra - Clientes Internos'),
            'acc-btn-pdf-cs-ext':          () => exportTablePDF('cs-ext',       'CS — Externo',       'Servicios Facturados - Clientes Externos'),
        };
        Object.entries(exportMap).forEach(([btnId, fn]) => {
            const btn = document.getElementById(btnId);
            if (btn) btn.addEventListener('click', fn);
        });

        // Generate report BAT button
        const btnGen = document.getElementById('acc-btn-generar');
        if (btnGen) btnGen.addEventListener('click', handleGenerarReporte);
    }

    // ─── Generate Report Handler ───────────────────────────────────────────
    function handleGenerarReporte() {
        const mes  = document.getElementById('acc-select-mes')?.value  || 'JUNIO';
        const anio = document.getElementById('acc-select-anio')?.value || '2026';

        // Build instructions overlay
        const overlay = document.getElementById('acc-gen-overlay');
        const cmdEl   = document.getElementById('acc-gen-command');
        if (overlay && cmdEl) {
            cmdEl.textContent = `py generar_reporte_contable_orquestador.py ${mes} ${anio}`;
            overlay.classList.remove('hidden');
        }
    }

    // ─── Render All ────────────────────────────────────────────────────────
    function renderAll() {
        if (!data) return;
        updatePeriodBadge();
        renderResumen();
        renderTableForTab('maestros-int');
        renderTableForTab('maestros-ext');
        renderTableForTab('cs-int');
        renderTableForTab('cs-ext');
        renderChartsForTab(activeTab);
    }

    function renderEmptyState() {
        const container = document.getElementById('acc-panel-resumen');
        if (!container) return;
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:320px;gap:1rem;opacity:0.6;">
                <i data-lucide="file-x" style="width:48px;height:48px;color:var(--color-primary);"></i>
                <h3 style="margin:0;color:var(--text-secondary);">Sin datos cargados</h3>
                <p style="margin:0;font-size:0.9rem;color:var(--text-muted);text-align:center;max-width:400px;">
                    Selecciona el mes y año, luego ejecuta el orquestador Python para generar el reporte contable.<br>
                    <code style="font-size:0.8rem;color:var(--color-primary);">py generar_reporte_contable_orquestador.py JUNIO 2026</code>
                </p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    }

    function updatePeriodBadge() {
        const badge = document.getElementById('acc-period-badge');
        if (badge && data) {
            badge.textContent = `${data.mes} ${data.anio}`;
        }
        // Sync selectors if possible
        const selMes  = document.getElementById('acc-select-mes');
        const selAnio = document.getElementById('acc-select-anio');
        if (selMes && data?.mes)  selMes.value  = data.mes;
        if (selAnio && data?.anio) selAnio.value = String(data.anio);
    }

    // ─── Resumen Tab ───────────────────────────────────────────────────────
    function renderResumen() {
        if (!data) return;
        const mi = data.maestrosInterno || { totalUSD: 0, totalHoras: 0, registros: [] };
        const me = data.maestrosExterno || { totalUSD: 0, registros: [] };
        const ci = data.csInterno       || { totalUSD: 0, totalHoras: 0, registros: [] };
        const ce = data.csExterno       || { totalUSD: 0, registros: [] };

        const totalMaestros = (mi.totalUSD || 0) + (me.totalUSD || 0);
        const totalCS       = (ci.totalUSD || 0) + (ce.totalUSD || 0);
        const totalGlobal   = totalMaestros + totalCS;

        setEl('acc-kpi-total-usd',      fmtUSD(totalGlobal));
        setEl('acc-kpi-maestros-total', fmtUSD(totalMaestros));
        setEl('acc-kpi-cs-total',       fmtUSD(totalCS));
        setEl('acc-kpi-total-regs',     (mi.registros.length + me.registros.length + ci.registros.length + ce.registros.length).toLocaleString());
        setEl('acc-kpi-maestros-int',   `${mi.registros.length} OTs`);
        setEl('acc-kpi-maestros-ext',   `${me.registros.length} facturas`);
        setEl('acc-kpi-cs-int',         `${ci.registros.length} OTs`);
        setEl('acc-kpi-cs-ext',         `${ce.registros.length} facturas`);

        renderResumenCharts(mi, me, ci, ce);
    }

    // Dynamic chart text and grid color helpers for Dark/Light mode
    function getChartTextColor(alpha = 0.85) {
        const isLight = document.body.classList.contains('light-mode');
        return isLight ? `rgba(15, 23, 42, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
    }
    function getChartGridColor() {
        const isLight = document.body.classList.contains('light-mode');
        return isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)';
    }

    function renderResumenCharts(mi, me, ci, ce) {
        const textColor = getChartTextColor();
        const textMuted = getChartTextColor(0.7);
        const gridColor = getChartGridColor();

        // Doughnut: Distribución por unidad de negocio y tipo
        const cvs = document.getElementById('acc-chart-resumen-dist');
        if (cvs && typeof Chart !== 'undefined') {
            destroyChart('resumen-dist');
            charts['resumen-dist'] = new Chart(cvs, {
                type: 'doughnut',
                data: {
                    labels: ['MAESTROS Interno', 'MAESTROS Externo', 'CS Interno', 'CS Externo'],
                    datasets: [{
                        data: [mi.totalUSD || 0, me.totalUSD || 0, ci.totalUSD || 0, ce.totalUSD || 0],
                        backgroundColor: [
                            COLORS.maestros.solid, 'rgba(14,165,233,0.4)',
                            COLORS.cs.solid,       'rgba(16,185,129,0.4)'
                        ],
                        borderColor: 'transparent',
                        hoverOffset: 10
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '62%',
                    plugins: {
                        legend: { position: 'bottom', labels: { color: textColor, font: { size: 11, weight: '600' }, padding: 16 } },
                        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}` } }
                    }
                }
            });
        }

        // Horizontal bar: MAESTROS vs CS por componente
        const cvs2 = document.getElementById('acc-chart-resumen-bar');
        if (cvs2 && typeof Chart !== 'undefined') {
            destroyChart('resumen-bar');
            charts['resumen-bar'] = new Chart(cvs2, {
                type: 'bar',
                data: {
                    labels: ['MAESTROS\nInterno', 'MAESTROS\nExterno', 'CS\nInterno', 'CS\nExterno'],
                    datasets: [{
                        label: 'Total USD',
                        data: [mi.totalUSD || 0, me.totalUSD || 0, ci.totalUSD || 0, ce.totalUSD || 0],
                        backgroundColor: [COLORS.maestros.solid, 'rgba(14,165,233,0.45)', COLORS.cs.solid, 'rgba(16,185,129,0.45)'],
                        borderRadius: 8, borderSkipped: false
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => ` USD ${fmtUSD(ctx.parsed.y)}` } }
                    },
                    scales: {
                        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11, weight: '600' } } },
                        y: { grid: { color: gridColor }, ticks: { color: textMuted, font: { size: 10 }, callback: (v) => `$${(v/1000).toFixed(0)}k` } }
                    }
                }
            });
        }
    }

    // ─── Table Render ──────────────────────────────────────────────────────
    function renderTableForTab(tabKey) {
        if (!data) return;
        const isInterno = tabKey.endsWith('-int');

        const dataMap = {
            'maestros-int': data.maestrosInterno?.registros || [],
            'maestros-ext': data.maestrosExterno?.registros || [],
            'cs-int':       data.csInterno?.registros       || [],
            'cs-ext':       data.csExterno?.registros       || [],
        };

        const tbodyId = `acc-tbody-${tabKey}`;
        const countId = `acc-count-${tabKey}`;
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;

        const term = searchTerms[tabKey] || '';
        const allRows = dataMap[tabKey] || [];
        const filtered = term ? allRows.filter(r =>
            (r.rms   || '').toLowerCase().includes(term) ||
            (r.desc  || '').toLowerCase().includes(term) ||
            (r.ceco  || '').toLowerCase().includes(term) ||
            (r.ot    || '').toLowerCase().includes(term) ||
            (r.ticket || '').toLowerCase().includes(term) ||
            (r.factura || '').toLowerCase().includes(term)
        ) : allRows;

        const countEl = document.getElementById(countId);
        if (countEl) countEl.textContent = `${filtered.length.toLocaleString()} de ${allRows.length.toLocaleString()} registros`;

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">Sin registros para mostrar</td></tr>`;
            return;
        }

        const color = (tabKey.startsWith('maestros')) ? 'var(--color-primary)' : 'var(--color-success)';

        filtered.forEach((rec, idx) => {
            const tr = document.createElement('tr');
            if (isInterno) {
                tr.innerHTML = `
                    <td style="font-size:0.75rem;color:var(--text-muted);text-align:center;">${idx + 1}</td>
                    <td><span style="font-family:var(--font-mono);font-size:0.8rem;color:${color};font-weight:600;">${esc(rec.rms)}</span></td>
                    <td style="font-size:0.82rem;">${esc(rec.desc)}</td>
                    <td><span class="badge" style="background:var(--bg-hover);color:var(--text-secondary);font-size:0.75rem;">${esc(rec.ceco)}</span></td>
                    <td style="font-family:var(--font-mono);font-size:0.82rem;color:var(--text-muted);">${esc(rec.ot)}</td>
                    <td style="text-align:right;font-family:var(--font-mono);font-size:0.82rem;">${rec.horas?.toFixed(1) || '—'}</td>
                    <td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:${color};">$${fmtUSD(rec.montoUSD)}</td>
                    <td style="text-align:right;font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">C$ ${fmtNum(rec.montoNIO)}</td>
                `;
            } else {
                tr.innerHTML = `
                    <td style="font-size:0.75rem;color:var(--text-muted);text-align:center;">${idx + 1}</td>
                    <td><span style="font-family:var(--font-mono);font-size:0.8rem;color:${color};font-weight:600;">${esc(rec.rms)}</span></td>
                    <td style="font-size:0.82rem;">${esc(rec.desc)}</td>
                    <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">${esc(rec.ticket)}</td>
                    <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;">${esc(rec.factura)}</td>
                    <td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:${color};">$${fmtUSD(rec.ventaUSD)}</td>
                    <td style="text-align:right;font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">C$ ${fmtNum(rec.ventaNIO)}</td>
                    <td></td>
                `;
            }
            tbody.appendChild(tr);
        });
    }

    // ─── Charts per Tab ────────────────────────────────────────────────────
    function renderChartsForTab(tabKey) {
        if (!data) return;
        const tabData = {
            'maestros-int': data.maestrosInterno,
            'maestros-ext': data.maestrosExterno,
            'cs-int':       data.csInterno,
            'cs-ext':       data.csExterno,
        };

        if (tabKey === 'resumen') {
            renderResumenCharts(
                data.maestrosInterno || {}, data.maestrosExterno || {},
                data.csInterno       || {}, data.csExterno       || {}
            );
            return;
        }

        const d = tabData[tabKey];
        if (!d) return;
        const isInterno = tabKey.endsWith('-int');
        const color = tabKey.startsWith('maestros') ? COLORS.maestros : COLORS.cs;

        if (isInterno) {
            renderCECOChart(tabKey, d, color);
            renderTopActivitiesInterno(tabKey, d, color);
        } else {
            renderTopServiciosExterno(tabKey, d, color);
        }
    }

    function renderCECOChart(tabKey, d, color) {
        const cvs = document.getElementById(`acc-chart-ceco-${tabKey}`);
        if (!cvs || typeof Chart === 'undefined') return;
        destroyChart(`ceco-${tabKey}`);

        const breakdown = d.cecoBreakdown || {};
        const entries = Object.entries(breakdown).sort((a, b) => b[1].totalUSD - a[1].totalUSD);
        if (entries.length === 0) return;

        const textColor = getChartTextColor();

        charts[`ceco-${tabKey}`] = new Chart(cvs, {
            type: 'doughnut',
            data: {
                labels: entries.map(([k]) => k),
                datasets: [{
                    data: entries.map(([, v]) => v.totalUSD),
                    backgroundColor: COLORS.palette.slice(0, entries.length),
                    borderColor: 'transparent',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '60%',
                plugins: {
                    legend: { position: 'right', labels: { color: textColor, font: { size: 10, weight: '600' }, boxWidth: 12 } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}` } }
                }
            }
        });
    }

    function renderTopActivitiesInterno(tabKey, d, color) {
        const cvs = document.getElementById(`acc-chart-top-${tabKey}`);
        if (!cvs || typeof Chart === 'undefined') return;
        destroyChart(`top-${tabKey}`);

        const regs = d.registros || [];
        // Group by desc, sum montoUSD
        const grouped = {};
        regs.forEach(r => {
            const key = r.desc || r.rms;
            if (!grouped[key]) grouped[key] = 0;
            grouped[key] += (r.montoUSD || 0);
        });
        const top8 = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (top8.length === 0) return;

        const textColor = getChartTextColor();
        const textMuted = getChartTextColor(0.7);
        const gridColor = getChartGridColor();

        charts[`top-${tabKey}`] = new Chart(cvs, {
            type: 'bar',
            data: {
                labels: top8.map(([k]) => k.length > 30 ? k.substring(0, 28) + '…' : k),
                datasets: [{
                    label: 'Total USD',
                    data: top8.map(([, v]) => v),
                    backgroundColor: color.solid,
                    borderRadius: 6, borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` USD ${fmtUSD(ctx.parsed.x)}` } }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textMuted, font: { size: 10 }, callback: (v) => `$${(v/1000).toFixed(0)}k` } },
                    y: { grid: { display: false }, ticks: { color: textColor, font: { size: 10, weight: '600' } } }
                }
            }
        });
    }

    function renderTopServiciosExterno(tabKey, d, color) {
        const cvs = document.getElementById(`acc-chart-top-${tabKey}`);
        if (!cvs || typeof Chart === 'undefined') return;
        destroyChart(`top-${tabKey}`);

        const regs = d.registros || [];
        const grouped = {};
        regs.forEach(r => {
            const key = r.desc || r.rms;
            if (!grouped[key]) grouped[key] = 0;
            grouped[key] += (r.ventaUSD || 0);
        });
        const top8 = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (top8.length === 0) return;

        const textColor = getChartTextColor();
        const textMuted = getChartTextColor(0.7);
        const gridColor = getChartGridColor();

        charts[`top-${tabKey}`] = new Chart(cvs, {
            type: 'bar',
            data: {
                labels: top8.map(([k]) => k.length > 30 ? k.substring(0, 28) + '…' : k),
                datasets: [{
                    label: 'Venta USD',
                    data: top8.map(([, v]) => v),
                    backgroundColor: color.solid,
                    borderRadius: 6, borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` USD ${fmtUSD(ctx.parsed.x)}` } }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 }, callback: (v) => `$${(v/1000).toFixed(0)}k` } },
                    y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.85)', font: { size: 10, weight: '600' } } }
                }
            }
        });
    }

    // ─── Export ────────────────────────────────────────────────────────────
    function getExportRows(tabKey) {
        if (!data) return [];
        const isInterno = tabKey.endsWith('-int');
        const dataMap = {
            'maestros-int': data.maestrosInterno?.registros || [],
            'maestros-ext': data.maestrosExterno?.registros || [],
            'cs-int':       data.csInterno?.registros       || [],
            'cs-ext':       data.csExterno?.registros       || [],
        };
        return dataMap[tabKey] || [];
    }

    function exportTableExcel(tabKey, filePrefix) {
        if (typeof XLSX === 'undefined') { showToast('Librería XLSX no cargada', 'error'); return; }
        const rows = getExportRows(tabKey);
        if (rows.length === 0) { showToast('Sin datos para exportar', 'warning'); return; }
        const isInterno = tabKey.endsWith('-int');

        const exportData = rows.map((r, i) => isInterno ? {
            '#': i + 1, 'RMS': r.rms, 'Descripción': r.desc, 'CECO': r.ceco,
            'OT': r.ot, 'Horas': r.horas, 'Costo USD': r.montoUSD, 'Costo C$': r.montoNIO
        } : {
            '#': i + 1, 'RMS': r.rms, 'Descripción': r.desc,
            'Ticket': r.ticket, 'Factura': r.factura, 'Venta USD': r.ventaUSD, 'Venta C$': r.ventaNIO
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, filePrefix.replace(/_/g, ' '));
        XLSX.writeFile(wb, `${filePrefix}_${data?.mes || ''}_${data?.anio || ''}.xlsx`);
        showToast('Excel exportado correctamente', 'success');
    }

    function exportTablePDF(tabKey, title, subtitle) {
        const jsPDFLib = window.jspdf?.jsPDF || window.jsPDF;
        if (!jsPDFLib) { showToast('Librería jsPDF no cargada', 'error'); return; }
        const rows = getExportRows(tabKey);
        if (rows.length === 0) { showToast('Sin datos para exportar', 'warning'); return; }
        const isInterno = tabKey.endsWith('-int');

        const doc = new jsPDFLib({ orientation: 'l', unit: 'mm', format: 'a4' });
        doc.setFontSize(14); doc.setTextColor(14, 165, 233);
        doc.text(title, 14, 16);
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`${subtitle} | ${data?.mes || ''} ${data?.anio || ''} | ${rows.length} registros`, 14, 23);

        const head = isInterno
            ? [['#', 'RMS', 'Descripción', 'CECO', 'OT', 'Horas', 'Costo USD', 'Costo C$']]
            : [['#', 'RMS', 'Descripción', 'Ticket', 'Factura', 'Venta USD', 'Venta C$']];

        const body = rows.map((r, i) => isInterno
            ? [i + 1, r.rms, r.desc, r.ceco, r.ot, r.horas?.toFixed(1), `$${fmtUSD(r.montoUSD)}`, `C$ ${fmtNum(r.montoNIO)}`]
            : [i + 1, r.rms, r.desc, r.ticket, r.factura, `$${fmtUSD(r.ventaUSD)}`, `C$ ${fmtNum(r.ventaNIO)}`]
        );

        doc.autoTable({
            startY: 28, head, body, theme: 'striped',
            headStyles: { fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 7.5, cellPadding: 2.5 },
            columnStyles: { 0: { cellWidth: 8 } }
        });
        doc.save(`${title.replace(/[^a-zA-Z0-9]/g, '_')}_${data?.mes || ''}_${data?.anio || ''}.pdf`);
        showToast('PDF exportado correctamente', 'success');
    }

    // ─── Live Polling ──────────────────────────────────────────────────────
    function initLivePolling() {
        setInterval(() => {
            const existing = document.querySelector('script[data-acc-live]');
            if (existing) existing.remove();
            const s = document.createElement('script');
            s.setAttribute('data-acc-live', '1');
            s.src = `datos_reporte_contable.js?t=${Date.now()}`;
            s.onload = () => {
                if (typeof window.REPORTE_CONTABLE_DATA !== 'undefined') {
                    const newData = window.REPORTE_CONTABLE_DATA;
                    if (!data || JSON.stringify(newData.generadoEn) !== JSON.stringify(data.generadoEn)) {
                        data = newData;
                        renderAll();
                    }
                }
                s.remove();
            };
            document.body.appendChild(s);
        }, 10000);
    }

    // ─── Utilities ─────────────────────────────────────────────────────────
    function destroyChart(key) {
        if (charts[key]) { charts[key].destroy(); delete charts[key]; }
    }

    function setEl(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function fmtUSD(n) {
        return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtNum(n) {
        return Number(n || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function esc(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

})();
