/**
 * FinControl - Disponibilidad de Tarjetas Module
 * Processes ZIP archives containing multiple PDF card statements.
 * Scans each statement for target card numbers, extracts their available balances,
 * and compiles a consolidated report with exporting capabilities.
 */

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Module State
const AvailState = {
    zipFile: null,
    scanResults: [] // { card, holder, status, balance, date, file }
};

// DOM Elements
const availElements = {
    inputZip: document.getElementById('input-zip-availability'),
    zipFileInfo: document.getElementById('zip-availability-file-info'),
    btnProcess: document.getElementById('btn-process-availability'),
    
    // Progress Panel
    progressPanel: document.getElementById('availability-progress'),
    progressFill: document.getElementById('availability-progress-fill'),
    progressStatus: document.getElementById('availability-progress-status'),
    progressPercent: document.getElementById('availability-progress-percent'),
    
    // Results
    resultsCard: document.getElementById('card-availability-results'),
    tbodyResults: document.querySelector('#table-availability tbody'),
    btnExport: document.getElementById('btn-export-csv'),
    btnPrint: document.getElementById('btn-print-report')
};

// Initialize listeners on load
document.addEventListener('DOMContentLoaded', () => {
    initAvailFileListeners();
    initExportListeners();
    
    // Listen for settings changes to re-render results if already scanned
    document.addEventListener('settingsChanged', () => {
        if (AvailState.scanResults.length > 0) {
            compileFinalResults();
        }
    });
});

// --- FILE UPLOAD & LISTENERS ---

function initAvailFileListeners() {
    const dropZone = document.getElementById('drop-zip-availability');
    
    availElements.inputZip.addEventListener('change', (e) => {
        handleAvailZipSelection(e.target.files[0]);
    });
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleAvailZipSelection(e.dataTransfer.files[0]);
        }
    });

    availElements.btnProcess.addEventListener('click', () => {
        processAvailabilityZip();
    });
}

function handleAvailZipSelection(file) {
    if (!file || (!file.name.endsWith('.zip') && file.type !== 'application/x-zip-compressed' && file.type !== 'application/zip')) {
        window.showToast('Por favor selecciona un archivo ZIP válido', 'error');
        return;
    }
    AvailState.zipFile = file;
    availElements.zipFileInfo.textContent = `${file.name} (${formatBytes(file.size)})`;
    availElements.zipFileInfo.style.color = 'var(--color-success)';
    availElements.btnProcess.removeAttribute('disabled');
    window.showToast('ZIP de Tesorería cargado', 'success');
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- SCANNING PIPELINE ---

async function processAvailabilityZip() {
    if (!AvailState.zipFile) return;

    try {
        console.log('Iniciando procesamiento de Disponibilidad...');
        // Reset UI State
        availElements.progressPanel.classList.remove('hidden');
        availElements.resultsCard.classList.add('hidden');
        
        // Show progress of 5% and status
        updateAvailProgress(5, 'Descomprimiendo archivos de Tesorería...');
        
        // Yield control to let the browser paint the progress bar unhiding and 5% status
        await new Promise(resolve => setTimeout(resolve, 150));

        console.log('Cargando el archivo ZIP con JSZip...');
        const zip = await JSZip.loadAsync(AvailState.zipFile);
        console.log('Archivo ZIP cargado con éxito.');
        
        const pdfFiles = [];
        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir && zipEntry.name.toLowerCase().endsWith('.pdf')) {
                pdfFiles.push(zipEntry);
            }
        });

        console.log(`ZIP descomprimido. Encontrados ${pdfFiles.length} archivos PDF.`);
        if (pdfFiles.length === 0) {
            throw new Error('El archivo ZIP no contiene ningún documento PDF.');
        }

        updateAvailProgress(15, `Encontrados ${pdfFiles.length} PDFs. Iniciando escaneo...`);
        // Wait another 100ms
        await new Promise(resolve => setTimeout(resolve, 100));

        // Temporary array for found cards
        const extractedCards = [];
        const targetCards = window.AppState.settings.targetCards;
        const totalPDFs = pdfFiles.length;

        for (let idx = 0; idx < totalPDFs; idx++) {
            const pdfEntry = pdfFiles[idx];
            const percent = 15 + Math.round((idx / totalPDFs) * 80);
            
            console.log(`Escaneando PDF [${idx + 1}/${totalPDFs}]: ${pdfEntry.name}`);
            updateAvailProgress(percent, `Procesando PDF ${idx + 1} de ${totalPDFs}: ${pdfEntry.name}...`);
            
            // Yield control back to event loop for 30ms to prevent browser freeze
            await new Promise(resolve => setTimeout(resolve, 30));

            try {
                const pdfData = await pdfEntry.async('arraybuffer');
                const text = await extractPdfText(pdfData);
                console.log(`Archivo ${pdfEntry.name} procesado (${text.length} caracteres).`);

                const lines = text.split('\n');
                const reportDate = extractReportDate(text);

                lines.forEach((line, lineIdx) => {
                    const trimmed = line.trim();
                    targetCards.forEach(targetCard => {
                        // Word boundary regex to prevent matching inside long reference numbers
                        const cardRegex = new RegExp(`\\b${targetCard}\\b`);
                        if (cardRegex.test(trimmed)) {
                            // Verify this is the parameters definition row
                            if (/monto|trans|limite|periodo|placa/i.test(trimmed)) {
                                console.log(`[Disponibilidad] Fila de definición de tarjeta ${targetCard} detectada: "${trimmed}"`);
                                
                                // Extract Plate / Identifier (text between card number and first keyword)
                                const cardIndex = trimmed.indexOf(targetCard);
                                const afterCard = trimmed.substring(cardIndex + targetCard.length).trim();
                                const keywordMatch = afterCard.match(/^(.*?)\s+(?:Monto|Trans|Limite|Asignado|Acumulado|Disponible)/i);
                                let identifier = "";
                                if (keywordMatch) {
                                    identifier = keywordMatch[1].trim();
                                }
                                
                                // Scan subsequent lines to locate "Monto por Periodo" or "Periodo"
                                let balanceNIO = null;
                                let balanceUSD = null;
                                let foundBalance = false;

                                for (let i = 1; i <= 12; i++) {
                                    const nextLineIdx = lineIdx + i;
                                    if (nextLineIdx >= lines.length) break;
                                    
                                    const nextLine = lines[nextLineIdx].trim();
                                    
                                    // Stop scanning if we hit another card number definition row
                                    if (/^\b\d{4}\b\s+.*?(?:monto|trans|limite|placa)/i.test(nextLine)) {
                                        break;
                                    }

                                    if (nextLine.toLowerCase().includes('monto por periodo') || nextLine.toLowerCase().includes('periodo')) {
                                        // Match decimal numbers: Asignado $, Acumulado $, Disponible $, Disponible C$
                                        const numbers = nextLine.match(/([\-\+]?[\d,]+\.\d{2})/g);
                                        if (numbers && numbers.length >= 2) {
                                            // Last number is NIO (Córdobas)
                                            // Second to last is USD (Dollars)
                                            const lastNum = parseFloat(numbers[numbers.length - 1].replace(/,/g, ''));
                                            const secLastNum = parseFloat(numbers[numbers.length - 2].replace(/,/g, ''));
                                            
                                            balanceNIO = lastNum;
                                            balanceUSD = secLastNum;
                                            foundBalance = true;
                                            console.log(`[Disponibilidad] Saldos extraídos para ${targetCard}: C$ ${balanceNIO}, $ ${balanceUSD}`);
                                            break;
                                        }
                                    }
                                }

                                if (foundBalance) {
                                    extractedCards.push({
                                        card: targetCard,
                                        holder: identifier ? `Placa: ${identifier}` : 'TARJETAHABIENTE CORPORATIVO',
                                        status: 'Encontrado',
                                        balanceNIO: balanceNIO,
                                        balanceUSD: balanceUSD,
                                        balance: balanceNIO, // NIO primary fallback
                                        date: reportDate || 'Día de Hoy',
                                        file: pdfEntry.name
                                    });
                                } else {
                                    console.warn(`[Disponibilidad] No se pudo localizar la fila 'Monto por Periodo' para la tarjeta ${targetCard}`);
                                }
                            }
                        }
                    });
                });
            } catch (err) {
                console.error(`Error al extraer datos de ${pdfEntry.name}:`, err);
            }
        }

        // Save raw scan results
        AvailState.scanResults = extractedCards;
        console.log('Resultados consolidados:', extractedCards);
        
        updateAvailProgress(100, '¡Escaneo finalizado con éxito!');

        setTimeout(() => {
            availElements.progressPanel.classList.add('hidden');
            compileFinalResults();
        }, 800);

    } catch (error) {
        console.error('Error general durante el escaneo de disponibilidad:', error);
        updateAvailProgress(0, 'Error en el escaneo');
        availElements.progressFill.style.backgroundColor = 'var(--color-danger)';
        window.showToast(`Error al procesar: ${error.message}`, 'error');
    }
}

// Extractor with Layout-Aware sorting to reconstruct lines
async function extractPdfText(pdfData) {
    const loadingTask = pdfjsLib.getDocument({data: pdfData});
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        const lines = {};
        textContent.items.forEach(item => {
            const y = Math.round(item.transform[5] / 4) * 4;
            if (!lines[y]) {
                lines[y] = [];
            }
            lines[y].push(item);
        });

        const sortedY = Object.keys(lines).sort((a, b) => b - a);
        sortedY.forEach(y => {
            const lineItems = lines[y].sort((a, b) => a.transform[4] - b.transform[4]);
            const lineStr = lineItems.map(item => item.str).join(" ");
            fullText += lineStr + "\n";
        });
    }

    return fullText;
}

// --- DATA EXTRACTION HEURISTICS ---

function extractBalance(text) {
    // Standard credit card balance keyword regexes
    const balancePatterns = [
        // Spanish patterns
        /(?:saldo\s+)?disponible(?:\s+compras|\s+para\s+compras|\s+local|\s+dolares|\s+cords|\s+nacional)?\s*(?::|-)?\s*(?:c\$|\$|usd|nio)?\s*([\-\+]?[\d,]+\.\d{2})/i,
        /limite\s+de\s+cr[eé]dito\s+disponible\s*(?::|-)?\s*(?:c\$|\$|usd|nio)?\s*([\-\+]?[\d,]+\.\d{2})/i,
        /disponibilidad(?:\s+total)?\s*(?::|-)?\s*(?:c\$|\$|usd|nio)?\s*([\-\+]?[\d,]+\.\d{2})/i,
        /monto\s+disponible\s*(?::|-)?\s*(?:c\$|\$|usd|nio)?\s*([\-\+]?[\d,]+\.\d{2})/i,
        // English patterns
        /available\s+(?:credit|balance|limit)\s*(?::|-)?\s*(?:c\$|\$|usd|nio)?\s*([\-\+]?[\d,]+\.\d{2})/i
    ];

    for (const pattern of balancePatterns) {
        const match = text.match(pattern);
        if (match) {
            const cleanStr = match[1].replace(/,/g, '');
            const balance = parseFloat(cleanStr);
            if (!isNaN(balance)) {
                return balance;
            }
        }
    }

    // Heuristics fallback: find lines containing "disponible" and grab the number in it
    const lines = text.split('\n');
    for (const line of lines) {
        if (/disponible|limite|cupo|balance/i.test(line)) {
            const numMatch = line.match(/([\d,]+\.\d{2})/);
            if (numMatch) {
                const balance = parseFloat(numMatch[1].replace(/,/g, ''));
                if (!isNaN(balance)) return balance;
            }
        }
    }

    return null;
}

function extractHolder(text) {
    // Look for owner name labels
    const holderPatterns = [
        /nombre\s*(?::|-)\s*([a-zA-Z\s\.]+)/i,
        /tarjetahabiente\s*(?::|-)\s*([a-zA-Z\s\.]+)/i,
        /cliente\s*(?::|-)\s*([a-zA-Z\s\.]+)/i,
        /titular\s*(?::|-)\s*([a-zA-Z\s\.]+)/i,
        /propietario\s*(?::|-)\s*([a-zA-Z\s\.]+)/i
    ];

    for (const pattern of holderPatterns) {
        const match = text.match(pattern);
        if (match) {
            const name = match[1].trim();
            // Check to avoid matching long paragraphs or generic strings
            if (name.length > 3 && name.length < 40 && !/banco|limite|estado|tarjeta/i.test(name)) {
                return name.toUpperCase();
            }
        }
    }

    // Secondary heuristic: standard corporate statements place the cardholder's name
    // near the top of the PDF page, typically on lines 2 to 6.
    const lines = text.split('\n');
    for (let i = 1; i < Math.min(8, lines.length); i++) {
        const line = lines[i].trim();
        // Look for lines that look like a person's name (multiple uppercase words)
        if (/^[A-Z\s]{4,30}$/.test(line) && !/ESTADO|CUENTA|BANCO|INFORME|TARJETA|PAGINA/i.test(line)) {
            return line;
        }
    }

    return null;
}

function extractReportDate(text) {
    // Look for statements cut date
    const datePatterns = [
        /fecha\s+de\s+corte\s*(?::|-)?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /fecha\s+emision\s*(?::|-)?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /fecha\s*(?::|-)?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /(\d{1,2}\/\d{1,2}\/\d{4})/ // generic date DD/MM/YYYY
    ];

    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
}

// --- RESULTS AGGREGATION & RENDERING ---

function compileFinalResults() {
    availElements.resultsCard.classList.remove('hidden');
    availElements.tbodyResults.innerHTML = '';

    const targetCards = window.AppState.settings.targetCards;
    const finalReport = [];

    // Map each target card checking if it was scanned
    targetCards.forEach(card => {
        // Find matching scanned card (grab latest scanned if multiple files processed)
        const scanned = AvailState.scanResults.filter(r => r.card === card);
        
        if (scanned.length > 0) {
            // Sort by file name or date if multiple exist, grabbing the last one
            const latest = scanned[scanned.length - 1];
            finalReport.push(latest);
        } else {
            // Card was not found in PDF zip
            finalReport.push({
                card: card,
                holder: '---',
                status: 'No Encontrado',
                balance: null,
                date: '---',
                file: '---'
            });
        }
    });

    // Populate table
    finalReport.forEach(row => {
        const tr = document.createElement('tr');
        
        let statusBadge = '';
        let balanceDisplay = '---';

        if (row.status === 'Encontrado') {
            statusBadge = `<span class="badge badge-success"><i data-lucide="check"></i>Encontrada</span>`;
            
            const nioVal = row.balanceNIO !== undefined && row.balanceNIO !== null ? window.formatCurrency(row.balanceNIO, 'NIO') : '---';
            const usdVal = row.balanceUSD !== undefined && row.balanceUSD !== null ? window.formatCurrency(row.balanceUSD, 'USD') : '---';
            
            balanceDisplay = `
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                    <strong>${nioVal}</strong>
                    <span class="text-muted" style="font-size: 0.75rem;">${usdVal}</span>
                </div>
            `;
        } else {
            statusBadge = `<span class="badge badge-danger"><i data-lucide="alert-circle"></i>No Encontrada</span>`;
            tr.style.opacity = '0.75';
        }

        tr.innerHTML = `
            <td class="font-medium">**** ${row.card}</td>
            <td>${row.holder}</td>
            <td>${statusBadge}</td>
            <td class="text-right font-medium color-info">${balanceDisplay}</td>
            <td>${row.date}</td>
            <td class="text-muted" style="font-size: 0.8rem; word-break: break-all;">${row.file}</td>
        `;
        
        availElements.tbodyResults.appendChild(tr);
    });

    lucide.createIcons();
}

function updateAvailProgress(percent, statusText) {
    availElements.progressFill.style.width = `${percent}%`;
    availElements.progressStatus.textContent = statusText;
    availElements.progressPercent.textContent = `${percent}%`;
}

// --- REPORT EXPORTS ---

function initExportListeners() {
    // Export CSV
    availElements.btnExport.addEventListener('click', () => {
        exportToCSV();
    });

    // Print Report
    availElements.btnPrint.addEventListener('click', () => {
        window.print();
    });
}

function exportToCSV() {
    const targetCards = window.AppState.settings.targetCards;
    
    // Build CSV Content
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Tarjeta,Titular/Placa,Estado,Disponible NIO,Disponible USD,Fecha Reporte,Archivo Fuente\n";

    targetCards.forEach(card => {
        const scanned = AvailState.scanResults.filter(r => r.card === card);
        const row = scanned.length > 0 ? scanned[scanned.length - 1] : {
            card: card, holder: '---', status: 'No Encontrado', balanceNIO: '---', balanceUSD: '---', date: '---', file: '---'
        };
        
        let valNIO = row.balanceNIO !== undefined && row.balanceNIO !== null ? row.balanceNIO : '---';
        let valUSD = row.balanceUSD !== undefined && row.balanceUSD !== null ? row.balanceUSD : '---';
        
        const line = `**** ${row.card},"${row.holder}",${row.status},${valNIO},${valUSD},${row.date},"${row.file}"`;
        csvContent += line + "\n";
    });

    // Download Trigger
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `Disponibilidad_Tarjetas_${today}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.showToast('CSV exportado correctamente', 'success');
}
