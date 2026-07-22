/**
 * FinControl - Main Application Controller
 * Manages UI navigation, settings persistence, theme toggling, and global utility functions.
 */

// Global App State
const AppState = {
    settings: {
        targetCards: ['1180', '2527', '2165', '1453', '8343'],
        reconCard: '9155',
        bank: 'BANPRO',
        toleranceDays: 4
    },
    currentView: 'reconciliation',
    theme: 'dark'
};

// DOM Elements
const elements = {
    body: document.body,
    themeToggleBtn: document.getElementById('theme-toggle'),
    viewTitle: document.getElementById('view-title'),
    viewSubtitle: document.getElementById('view-subtitle'),
    currentDateSpan: document.getElementById('current-date'),
    toastContainer: document.getElementById('toast-container'),
    
    // Sidebar Links
    menuReconciliation: document.getElementById('menu-reconciliation'),
    menuAvailability: document.getElementById('menu-availability'),
    menuSettings: document.getElementById('menu-settings'),
    
    // Views
    viewReconciliation: document.getElementById('view-reconciliation'),
    viewAvailability: document.getElementById('view-availability'),
    viewSettings: document.getElementById('view-settings'),

    // Settings elements
    inputTargetCards: document.getElementById('input-target-cards'),
    cardsListPreview: document.getElementById('cards-list-preview'),
    formSettingsCards: document.getElementById('form-settings-cards'),
    inputReconCard: document.getElementById('input-recon-card'),
    selectBank: document.getElementById('select-bank'),
    inputMatchTolerance: document.getElementById('input-match-tolerance'),
    formSettingsReconciliation: document.getElementById('form-settings-reconciliation')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initTheme();
    initNavigation();
    initDragAndDropGlobal();
    initSettingsView();
    initCardInventoryModule();
    updateDateBadge();
    
    // Initialize icons
    lucide.createIcons();
    
    showToast('Dashboard cargado correctamente', 'info');
});

// --- SETTINGS MANAGEMENT ---

function loadSettings() {
    const savedSettings = localStorage.getItem('fincontrol_settings');
    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            // Merge defaults with parsed values to prevent missing properties (like reconCard or bank)
            AppState.settings = { ...AppState.settings, ...parsed };
        } catch (e) {
            console.error('Error loading settings from localStorage, using defaults', e);
        }
    } else {
        saveSettingsToStorage();
    }
}

function saveSettingsToStorage() {
    localStorage.setItem('fincontrol_settings', JSON.stringify(AppState.settings));
}

function initSettingsView() {
    // Populate form fields
    elements.inputTargetCards.value = AppState.settings.targetCards.join(', ');
    elements.inputReconCard.value = AppState.settings.reconCard;
    elements.selectBank.value = AppState.settings.bank;
    elements.inputMatchTolerance.value = AppState.settings.toleranceDays;

    renderConfigCardBadges();

    // Update reconciliation subtitles/cards dynamically on load
    const cardStatementSub = document.querySelector('#card-statement .card-subtitle');
    if (cardStatementSub) {
        cardStatementSub.textContent = `Tarjeta corporativa ${AppState.settings.bank} ${AppState.settings.reconCard}`;
    }

    // Bind cards form submit
    elements.formSettingsCards.addEventListener('submit', (e) => {
        e.preventDefault();
        const cardsText = elements.inputTargetCards.value;
        const cardsArray = cardsText.split(',')
                                    .map(c => c.trim())
                                    .filter(c => c.length === 4 && /^\d+$/.test(c));
        
        if (cardsArray.length === 0) {
            showToast('Por favor introduce números de tarjeta válidos (4 dígitos)', 'error');
            return;
        }

        AppState.settings.targetCards = cardsArray;
        saveSettingsToStorage();
        renderConfigCardBadges();
        elements.inputTargetCards.value = cardsArray.join(', ');
        
        // Dispatch custom event to notify availability script that settings changed
        document.dispatchEvent(new CustomEvent('settingsChanged'));
        showToast('Tarjetas de Disponibilidad guardadas correctamente', 'success');
    });

    // Bind reconciliation preferences form submit
    elements.formSettingsReconciliation.addEventListener('submit', (e) => {
        e.preventDefault();
        const reconCardVal = elements.inputReconCard.value.trim();
        const bankVal = elements.selectBank.value;
        const toleranceVal = parseInt(elements.inputMatchTolerance.value, 10);

        if (reconCardVal.length !== 4 || !/^\d+$/.test(reconCardVal)) {
            showToast('La tarjeta de rendición debe tener exactamente 4 dígitos', 'error');
            return;
        }

        if (isNaN(toleranceVal) || toleranceVal < 0 || toleranceVal > 15) {
            showToast('La tolerancia de fecha debe ser un número entre 0 y 15 días', 'error');
            return;
        }

        AppState.settings.reconCard = reconCardVal;
        AppState.settings.bank = bankVal;
        AppState.settings.toleranceDays = toleranceVal;
        saveSettingsToStorage();

        // Update reconciliation subtitles/cards dynamically
        const cardStatementSub = document.querySelector('#card-statement .card-subtitle');
        if (cardStatementSub) {
            cardStatementSub.textContent = `Tarjeta corporativa ${bankVal} ${reconCardVal}`;
        }
        
        showToast('Preferencias de rendición guardadas correctamente', 'success');
    });
}

function renderConfigCardBadges() {
    elements.cardsListPreview.innerHTML = '';
    AppState.settings.targetCards.forEach((card, idx) => {
        const badge = document.createElement('div');
        badge.className = 'config-badge';
        badge.innerHTML = `
            <span>**** ${card}</span>
            <button class="config-badge-remove" type="button" data-index="${idx}">&times;</button>
        `;
        
        // Handle badge removal
        badge.querySelector('.config-badge-remove').addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            AppState.settings.targetCards.splice(index, 1);
            saveSettingsToStorage();
            renderConfigCardBadges();
            elements.inputTargetCards.value = AppState.settings.targetCards.join(', ');
            document.dispatchEvent(new CustomEvent('settingsChanged'));
            showToast('Tarjeta eliminada', 'info');
        });

        elements.cardsListPreview.appendChild(badge);
    });
}

// --- THEME MANAGEMENT ---

function initTheme() {
    const savedTheme = localStorage.getItem('fincontrol_theme');
    if (savedTheme) {
        AppState.theme = savedTheme;
    } else {
        // System preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        AppState.theme = prefersDark ? 'dark' : 'light';
    }

    applyTheme();

    elements.themeToggleBtn.addEventListener('click', () => {
        AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('fincontrol_theme', AppState.theme);
        applyTheme();
        showToast(`Cambiado a Modo ${AppState.theme === 'dark' ? 'Oscuro' : 'Claro'}`, 'info');
    });
}

function applyTheme() {
    if (AppState.theme === 'dark') {
        elements.body.classList.remove('light-mode');
        elements.body.classList.add('dark-mode');
        elements.themeToggleBtn.querySelector('span').textContent = 'Modo Claro';
    } else {
        elements.body.classList.remove('dark-mode');
        elements.body.classList.add('light-mode');
        elements.themeToggleBtn.querySelector('span').textContent = 'Modo Oscuro';
    }
    lucide.createIcons();
}

// --- NAVIGATION MANAGEMENT ---

function initNavigation() {
    const menuItems = [
        { btn: elements.menuReconciliation, view: elements.viewReconciliation, title: 'Rendición de Cuentas', subtitle: 'Concilia facturas (ZIP) con tu estado de cuenta BANPRO (PDF)' },
        { btn: elements.menuAvailability, view: elements.viewAvailability, title: 'Disponibilidad de Tarjetas', subtitle: 'Extrae saldos disponibles de los PDFs de Tesorería' },
        { btn: elements.menuSettings, view: elements.viewSettings, title: 'Configuración de Parámetros', subtitle: 'Administra tus tarjetas corporativas y variables de sistema' }
    ];

    menuItems.forEach(item => {
        item.btn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Deactivate all
            menuItems.forEach(mi => {
                mi.btn.classList.remove('active');
                mi.view.classList.remove('active');
            });

            // Activate current
            item.btn.classList.add('active');
            item.view.classList.add('active');
            
            // Update titles
            elements.viewTitle.textContent = item.title;
            elements.viewSubtitle.textContent = item.subtitle;
            
            // Scroll to top of main-content
            document.querySelector('.main-content').scrollTop = 0;
            
            AppState.currentView = item.view.id.replace('view-', '');
        });
    });

    // Check hash for routing on initial load
    const hash = window.location.hash;
    if (hash === '#availability') {
        elements.menuAvailability.click();
    } else if (hash === '#settings') {
        elements.menuSettings.click();
    }
}

// --- DRAG AND DROP UTILS ---

function initDragAndDropGlobal() {
    const dropzones = document.querySelectorAll('.drop-zone');

    dropzones.forEach(zone => {
        const input = zone.querySelector('input[type="file"]');

        // Click triggers file dialog
        zone.addEventListener('click', () => {
            input.click();
        });

        // Drag events
        ['dragenter', 'dragover'].forEach(eventName => {
            zone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            zone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.remove('dragover');
            }, false);
        });
    });
}

// --- UTILITIES ---

function updateDateBadge() {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    const todayStr = new Date().toLocaleDateString('es-ES', options);
    elements.currentDateSpan.textContent = todayStr;
}

// Toast Notifications System
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'x-circle';
    if (type === 'warning') iconName = 'alert-triangle';

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;

    elements.toastContainer.appendChild(toast);
    lucide.createIcons();

    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeIn 0.3s ease reverse';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// Global Currency Formatter
function formatCurrency(amount, currency = 'USD') {
    const formatter = new Intl.NumberFormat('es-NI', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
    });
    // If it's Córdobas, clean BAC style representation
    let formatted = formatter.format(amount);
    if (currency === 'NIO') {
        formatted = formatted.replace('NIO', 'C$');
    }
    return formatted;
}

// Global Date Parser helper
function parseLocaleDate(dateStr) {
    if (!dateStr) return null;
    
    // Matches DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
    const dateParts = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dateParts) {
        let day = parseInt(dateParts[1], 10);
        let month = parseInt(dateParts[2], 10) - 1; // 0-indexed month
        let year = parseInt(dateParts[3], 10);
        if (year < 100) year += 2000; // handle 2-digit years
        return new Date(year, month, day);
    }
    
    // Check for DD MMM (like "25 MAY")
    const monthsShort = {
        'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11,
        'jan': 0, 'apr': 3, 'aug': 7, 'dec': 11
    };
    
    const textDateParts = dateStr.match(/(\d{1,2})\s*([a-zA-Z]{3})/i);
    if (textDateParts) {
        let day = parseInt(textDateParts[1], 10);
        let monthStr = textDateParts[2].toLowerCase();
        let month = monthsShort[monthStr];
        if (month !== undefined) {
            let currentYear = new Date().getFullYear();
            return new Date(currentYear, month, day);
        }
    }

    // Try standard JS Date parsing fallback
    const timestamp = Date.parse(dateStr);
    if (!isNaN(timestamp)) {
        return new Date(timestamp);
    }

    return null;
}

// Make functions globally accessible
window.AppState = AppState;
window.showToast = showToast;
window.formatCurrency = formatCurrency;
window.parseLocaleDate = parseLocaleDate;

// ==========================================================================
// CARD INVENTORY & SECURITY MODULE
// ==========================================================================

const CardInventoryState = {
    isUnlocked: false,
    cards: [],
    searchQuery: '',
    filterType: 'ALL',
    filterStatus: 'ALL',
    editingCardId: null,
    tempPlasticBase64: '',
    tempRegFrontBase64: '',
    tempRegBackBase64: ''
};

function compressImageFile(file, maxWidth = 1000, quality = 0.75) {
    return new Promise((resolve) => {
        if (!file) {
            resolve('');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
    });
}

function getInventorySecurity() {
    const data = localStorage.getItem('fincontrol_inv_security');
    if (!data) return null;
    try {
        return JSON.parse(data);
    } catch (e) {
        return null;
    }
}

function saveInventorySecurity(pin, question, answer) {
    const secObj = {
        pin: btoa(pin),
        question: question,
        answer: btoa(answer.trim().toLowerCase())
    };
    localStorage.setItem('fincontrol_inv_security', JSON.stringify(secObj));
}

function initCardInventoryModule() {
    const elLocked = document.getElementById('inv-locked-challenge');
    const elUnlocked = document.getElementById('inv-unlocked-panel');
    const formLogin = document.getElementById('form-inv-login');
    const inputPass = document.getElementById('input-inv-pass');
    const btnLock = document.getElementById('btn-lock-inv');
    const btnForgot = document.getElementById('btn-forgot-inv-pass');
    const btnSetup = document.getElementById('btn-setup-inv-pass');
    const badgeStatus = document.getElementById('inv-security-status-badge');

    // Modals
    const modalCard = document.getElementById('modal-inventory-card');
    const modalSec = document.getElementById('modal-inventory-security');
    const modalPlastic = document.getElementById('modal-view-card-plastic');

    // Check if security is configured
    const sec = getInventorySecurity();
    if (!sec) {
        // Set default security (PIN: 1234, Question: Palabra Clave, Answer: admin)
        saveInventorySecurity('1234', '¿Palabra Clave o Código Maestro?', 'admin');
    }

    // Login Form Submit
    if (formLogin) {
        formLogin.addEventListener('submit', (e) => {
            e.preventDefault();
            const entered = inputPass.value;
            const currentSec = getInventorySecurity();
            if (currentSec && btoa(entered) === currentSec.pin) {
                CardInventoryState.isUnlocked = true;
                elLocked.classList.add('hidden');
                elUnlocked.classList.remove('hidden');
                inputPass.value = '';
                if (badgeStatus) {
                    badgeStatus.innerHTML = `
                        <span class="badge badge-success" style="font-size: 0.8rem; padding: 0.35rem 0.65rem;">
                            <i data-lucide="unlock" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i> Desbloqueado
                        </span>`;
                    lucide.createIcons();
                }
                showToast('Sesión de inventario iniciada', 'success');
                loadAndRenderCardInventory();
            } else {
                showToast('Contraseña o PIN incorrecto', 'error');
            }
        });
    }

    // Lock Session
    if (btnLock) {
        btnLock.addEventListener('click', () => {
            CardInventoryState.isUnlocked = false;
            elUnlocked.classList.add('hidden');
            elLocked.classList.remove('hidden');
            if (badgeStatus) {
                badgeStatus.innerHTML = `
                    <span class="badge badge-warning" style="font-size: 0.8rem; padding: 0.35rem 0.65rem;">
                        <i data-lucide="lock" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i> Protegido
                    </span>`;
                lucide.createIcons();
            }
            showToast('Inventario bloqueado por seguridad', 'info');
        });
    }

    // Setup / Recovery Modal Triggers
    if (btnSetup) {
        btnSetup.addEventListener('click', () => {
            openSecurityModal('setup');
        });
    }
    if (btnForgot) {
        btnForgot.addEventListener('click', () => {
            openSecurityModal('recovery');
        });
    }

    // Security Form Submit
    const formSec = document.getElementById('form-inv-security');
    if (formSec) {
        formSec.addEventListener('submit', (e) => {
            e.preventDefault();
            const mode = document.getElementById('input-sec-mode').value;
            if (mode === 'setup') {
                const newPin = document.getElementById('input-sec-new-pass').value;
                const question = document.getElementById('select-sec-question').value;
                const answer = document.getElementById('input-sec-answer').value;
                if (!newPin || !answer) {
                    showToast('Por favor completa todos los campos de seguridad', 'warning');
                    return;
                }
                saveInventorySecurity(newPin, question, answer);
                modalSec.classList.remove('active');
                showToast('Contraseña y pregunta secreta guardadas con éxito', 'success');
            } else if (mode === 'recovery') {
                const ansInput = document.getElementById('input-sec-recovery-answer').value.trim().toLowerCase();
                const resetPin = document.getElementById('input-sec-reset-pass').value;
                const currentSec = getInventorySecurity();
                if (currentSec && btoa(ansInput) === currentSec.answer) {
                    if (!resetPin || resetPin.length < 4) {
                        showToast('La nueva contraseña debe tener al menos 4 caracteres', 'warning');
                        return;
                    }
                    saveInventorySecurity(resetPin, currentSec.question, ansInput);
                    modalSec.classList.remove('active');
                    showToast('Contraseña restablecida correctamente. Ya puedes ingresar.', 'success');
                } else {
                    showToast('Respuesta secreta incorrecta', 'error');
                }
            }
        });
    }

    // Modal Security Close/Cancel
    document.getElementById('btn-close-modal-sec')?.addEventListener('click', () => modalSec.classList.remove('active'));
    document.getElementById('btn-cancel-modal-sec')?.addEventListener('click', () => modalSec.classList.remove('active'));

    // Search and Filter Listeners
    document.getElementById('input-search-inv')?.addEventListener('input', (e) => {
        CardInventoryState.searchQuery = e.target.value.toLowerCase();
        renderInventoryTable();
    });
    document.getElementById('select-filter-inv-type')?.addEventListener('change', (e) => {
        CardInventoryState.filterType = e.target.value;
        renderInventoryTable();
    });
    document.getElementById('select-filter-inv-status')?.addEventListener('change', (e) => {
        CardInventoryState.filterStatus = e.target.value;
        renderInventoryTable();
    });

    // Add Card Modal Trigger
    document.getElementById('btn-add-inv-card')?.addEventListener('click', () => {
        openCardModal(null);
    });

    // Card Type Select Change in Card Modal (Show/Hide Vehicle section)
    const selectCardType = document.getElementById('select-inv-card-type');
    const groupVehicle = document.getElementById('group-inv-vehicle');
    if (selectCardType && groupVehicle) {
        selectCardType.addEventListener('change', () => {
            if (selectCardType.value === 'combustible') {
                groupVehicle.style.display = 'block';
            } else {
                groupVehicle.style.display = 'none';
            }
        });
    }

    // Image Upload Handling (Plastic & Circulation Front/Back)
    const inputPlasticImg = document.getElementById('input-inv-plastic-image');
    if (inputPlasticImg) {
        inputPlasticImg.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const compressed = await compressImageFile(file);
                CardInventoryState.tempPlasticBase64 = compressed;
                const imgPrev = document.getElementById('img-inv-plastic-preview');
                const containerPrev = document.getElementById('inv-plastic-preview-container');
                if (imgPrev && containerPrev) {
                    imgPrev.src = compressed;
                    containerPrev.style.display = 'block';
                }
            }
        });
    }

    const inputRegFront = document.getElementById('input-inv-reg-front');
    if (inputRegFront) {
        inputRegFront.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const compressed = await compressImageFile(file);
                CardInventoryState.tempRegFrontBase64 = compressed;
                const imgPrev = document.getElementById('img-inv-reg-front-preview');
                const containerPrev = document.getElementById('inv-reg-front-preview-container');
                if (imgPrev && containerPrev) {
                    imgPrev.src = compressed;
                    containerPrev.style.display = 'block';
                }
            }
        });
    }

    const inputRegBack = document.getElementById('input-inv-reg-back');
    if (inputRegBack) {
        inputRegBack.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const compressed = await compressImageFile(file);
                CardInventoryState.tempRegBackBase64 = compressed;
                const imgPrev = document.getElementById('img-inv-reg-back-preview');
                const containerPrev = document.getElementById('inv-reg-back-preview-container');
                if (imgPrev && containerPrev) {
                    imgPrev.src = compressed;
                    containerPrev.style.display = 'block';
                }
            }
        });
    }

    // Form Inventory Card Submit
    const formCard = document.getElementById('form-inventory-card');
    if (formCard) {
        formCard.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('input-inv-card-id').value || 'card_' + Date.now();
            const type = document.getElementById('select-inv-card-type').value;
            const bank = document.getElementById('select-inv-card-bank').value;
            const cardNumber = document.getElementById('input-inv-card-number').value.trim();
            const status = document.getElementById('select-inv-card-status').value;
            const holderName = document.getElementById('input-inv-holder-name').value.trim();
            const holderCode = document.getElementById('input-inv-holder-code').value.trim();
            const vehiclePlate = type === 'combustible' ? document.getElementById('input-inv-vehicle-plate').value.trim().toUpperCase() : '';
            const vehicleReg = type === 'combustible' ? document.getElementById('input-inv-vehicle-reg').value.trim().toUpperCase() : '';
            const notes = document.getElementById('textarea-inv-notes').value.trim();

            const cardObj = {
                id: id,
                type: type,
                bank: bank,
                cardNumber: cardNumber,
                status: status,
                holderName: holderName,
                holderCode: holderCode,
                vehiclePlate: vehiclePlate,
                vehicleReg: vehicleReg,
                plasticImage: CardInventoryState.tempPlasticBase64 || '',
                regFrontImage: type === 'combustible' ? (CardInventoryState.tempRegFrontBase64 || '') : '',
                regBackImage: type === 'combustible' ? (CardInventoryState.tempRegBackBase64 || '') : '',
                notes: notes,
                updatedAt: new Date().toISOString()
            };

            try {
                if (window.dbSaveInventoryCard) {
                    await window.dbSaveInventoryCard(cardObj);
                }
                modalCard.classList.remove('active');
                showToast('Tarjeta de inventario guardada correctamente', 'success');
                loadAndRenderCardInventory();
            } catch (err) {
                console.error('Error saving inventory card:', err);
                showToast('Error al guardar la tarjeta en la base de datos', 'error');
            }
        });
    }

    // Modal Card Close/Cancel
    document.getElementById('btn-close-modal-inv-card')?.addEventListener('click', () => modalCard.classList.remove('active'));
    document.getElementById('btn-cancel-modal-inv-card')?.addEventListener('click', () => modalCard.classList.remove('active'));

    // Modal Plastic Close
    document.getElementById('btn-close-modal-plastic')?.addEventListener('click', () => modalPlastic.classList.remove('active'));
    document.getElementById('btn-close-view-plastic')?.addEventListener('click', () => modalPlastic.classList.remove('active'));

    // Reports PDF / CSV Buttons
    document.getElementById('btn-export-inv-pdf')?.addEventListener('click', () => {
        generateCardInventoryPdfReport();
    });
    document.getElementById('btn-export-inv-csv')?.addEventListener('click', () => {
        exportCardInventoryCSV();
    });
}

function openSecurityModal(mode) {
    const modalSec = document.getElementById('modal-inventory-security');
    const titleSec = document.getElementById('modal-sec-title');
    const modeInput = document.getElementById('input-sec-mode');
    const fieldsSetup = document.getElementById('sec-fields-setup');
    const fieldsRecovery = document.getElementById('sec-fields-recovery');
    const txtQuestion = document.getElementById('txt-sec-recovery-question');
    const btnSubmit = document.getElementById('btn-submit-sec');

    modeInput.value = mode;
    if (mode === 'setup') {
        titleSec.textContent = 'Configuración de Contraseña / PIN';
        fieldsSetup.classList.remove('hidden');
        fieldsRecovery.classList.add('hidden');
        btnSubmit.textContent = 'Guardar Contraseña';
    } else {
        titleSec.textContent = 'Recuperación de Contraseña';
        fieldsSetup.classList.add('hidden');
        fieldsRecovery.classList.remove('hidden');
        btnSubmit.textContent = 'Restablecer Contraseña';
        const currentSec = getInventorySecurity();
        if (currentSec) {
            txtQuestion.textContent = 'Pregunta Secreta: ' + currentSec.question;
        } else {
            txtQuestion.textContent = 'Pregunta Secreta: ¿Palabra Clave o Código Maestro?';
        }
    }
    modalSec.classList.add('active');
}

async function loadAndRenderCardInventory() {
    try {
        if (window.dbGetAllInventoryCards) {
            const list = await window.dbGetAllInventoryCards();
            CardInventoryState.cards = list || [];
        }
    } catch (err) {
        console.error('Error loading inventory cards from DB:', err);
    }
    renderInventoryTable();
}

function renderInventoryTable() {
    const tbody = document.querySelector('#table-inv-cards tbody');
    if (!tbody) return;

    let filtered = CardInventoryState.cards.filter(c => {
        if (CardInventoryState.filterType !== 'ALL' && c.type !== CardInventoryState.filterType) return false;
        if (CardInventoryState.filterStatus !== 'ALL' && c.status !== CardInventoryState.filterStatus) return false;
        if (CardInventoryState.searchQuery) {
            const q = CardInventoryState.searchQuery;
            const matchCard = (c.cardNumber || '').toLowerCase().includes(q);
            const matchHolder = (c.holderName || '').toLowerCase().includes(q);
            const matchCode = (c.holderCode || '').toLowerCase().includes(q);
            const matchPlate = (c.vehiclePlate || '').toLowerCase().includes(q);
            const matchReg = (c.vehicleReg || '').toLowerCase().includes(q);
            const matchBank = (c.bank || '').toLowerCase().includes(q);
            if (!matchCard && !matchHolder && !matchCode && !matchPlate && !matchReg && !matchBank) return false;
        }
        return true;
    });

    // Update Badges
    const statTotal = document.getElementById('stat-inv-total-val');
    const statFuel = document.getElementById('stat-inv-fuel-val');
    const statCorp = document.getElementById('stat-inv-corp-val');
    const statIssues = document.getElementById('stat-inv-issues-val');

    if (statTotal) statTotal.textContent = CardInventoryState.cards.length;
    if (statFuel) statFuel.textContent = CardInventoryState.cards.filter(c => c.type === 'combustible').length;
    if (statCorp) statCorp.textContent = CardInventoryState.cards.filter(c => c.type === 'corporativa').length;
    if (statIssues) statIssues.textContent = CardInventoryState.cards.filter(c => c.status !== 'Activa').length;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted" style="padding: 2rem;">
                    <i data-lucide="inbox" style="width: 32px; height: 32px; margin-bottom: 0.5rem; display: block; margin: 0 auto; opacity: 0.5;"></i>
                    No se encontraron tarjetas registradas con los filtros seleccionados.
                </td>
            </tr>`;
        lucide.createIcons();
        return;
    }

    let html = '';
    filtered.forEach(c => {
        const isFuel = c.type === 'combustible';
        const typeBadge = isFuel 
            ? `<span class="badge badge-success"><i data-lucide="truck" style="width: 12px; height: 12px; display: inline-block;"></i> Combustible</span>`
            : `<span class="badge badge-info"><i data-lucide="building" style="width: 12px; height: 12px; display: inline-block;"></i> Corporativa</span>`;

        let statusBadgeClass = 'badge-success';
        if (c.status === 'Extraviada' || c.status === 'Dañada') statusBadgeClass = 'badge-danger';
        if (c.status === 'En Reemplazo') statusBadgeClass = 'badge-warning';

        const statusBadge = `<span class="badge ${statusBadgeClass}">${c.status || 'Activa'}</span>`;

        const hasPhotos = c.plasticImage || c.regFrontImage || c.regBackImage;
        const plasticBtn = hasPhotos 
            ? `<button class="btn btn-sm btn-secondary btn-view-plastic" data-id="${c.id}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">
                 <i data-lucide="image" style="width: 13px; height: 13px; vertical-align: middle;"></i> Ver Fotos
               </button>`
            : `<span class="text-muted" style="font-size: 0.75rem;">Sin Fotos</span>`;

        const vehicleInfo = isFuel 
            ? `<strong>Placa:</strong> ${c.vehiclePlate || 'N/D'}<br><span class="text-muted" style="font-size: 0.75rem;">Circulación: ${c.vehicleReg || 'N/D'}</span>`
            : `<span class="text-muted" style="font-size: 0.8rem;">No aplica (Corporativa)</span>`;

        html += `
            <tr>
                <td>${typeBadge}</td>
                <td><strong>**** ${c.cardNumber}</strong><br><span class="text-muted" style="font-size: 0.75rem;">${c.bank || 'BANPRO'}</span></td>
                <td><strong>${c.holderName || 'N/D'}</strong><br><span class="text-muted" style="font-size: 0.75rem;">Código: ${c.holderCode || 'N/D'}</span></td>
                <td>${vehicleInfo}</td>
                <td>${plasticBtn}</td>
                <td>${statusBadge}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-secondary btn-edit-card" data-id="${c.id}" title="Editar Tarjeta" style="padding: 0.25rem 0.45rem;">
                        <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="btn btn-sm btn-danger btn-delete-card" data-id="${c.id}" title="Eliminar Tarjeta" style="padding: 0.25rem 0.45rem;">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </td>
            </tr>`;
    });

    tbody.innerHTML = html;
    lucide.createIcons();

    // Bind action buttons
    tbody.querySelectorAll('.btn-view-plastic').forEach(btn => {
        btn.addEventListener('click', () => {
            const cardId = btn.getAttribute('data-id');
            const card = CardInventoryState.cards.find(x => x.id === cardId);
            if (card) {
                const txtInfo = document.getElementById('txt-full-plastic-info');
                if (txtInfo) txtInfo.textContent = `Tarjeta: **** ${card.cardNumber} | Responsable: ${card.holderName} (${card.holderCode}) ${card.vehiclePlate ? '| Placa: ' + card.vehiclePlate : ''}`;
                
                // Plastic Image
                const imgPlastic = document.getElementById('img-full-plastic');
                const noPlastic = document.getElementById('no-plastic-text');
                if (card.plasticImage) {
                    imgPlastic.src = card.plasticImage;
                    imgPlastic.style.display = 'inline-block';
                    if (noPlastic) noPlastic.style.display = 'none';
                } else {
                    imgPlastic.style.display = 'none';
                    if (noPlastic) noPlastic.style.display = 'block';
                }

                // Reg Front Image
                const imgRegFront = document.getElementById('img-full-reg-front');
                const noRegFront = document.getElementById('no-reg-front-text');
                if (card.regFrontImage) {
                    imgRegFront.src = card.regFrontImage;
                    imgRegFront.style.display = 'inline-block';
                    if (noRegFront) noRegFront.style.display = 'none';
                } else {
                    imgRegFront.style.display = 'none';
                    if (noRegFront) noRegFront.style.display = 'block';
                }

                // Reg Back Image
                const imgRegBack = document.getElementById('img-full-reg-back');
                const noRegBack = document.getElementById('no-reg-back-text');
                if (card.regBackImage) {
                    imgRegBack.src = card.regBackImage;
                    imgRegBack.style.display = 'inline-block';
                    if (noRegBack) noRegBack.style.display = 'none';
                } else {
                    imgRegBack.style.display = 'none';
                    if (noRegBack) noRegBack.style.display = 'block';
                }

                document.getElementById('modal-view-card-plastic').classList.add('active');
            }
        });
    });

    tbody.querySelectorAll('.btn-edit-card').forEach(btn => {
        btn.addEventListener('click', () => {
            const cardId = btn.getAttribute('data-id');
            const card = CardInventoryState.cards.find(x => x.id === cardId);
            if (card) {
                openCardModal(card);
            }
        });
    });

    tbody.querySelectorAll('.btn-delete-card').forEach(btn => {
        btn.addEventListener('click', async () => {
            const cardId = btn.getAttribute('data-id');
            if (confirm('¿Estás seguro de eliminar esta tarjeta del inventario?')) {
                if (window.dbDeleteInventoryCard) {
                    await window.dbDeleteInventoryCard(cardId);
                    showToast('Tarjeta eliminada correctamente', 'info');
                    loadAndRenderCardInventory();
                }
            }
        });
    });
}

function openCardModal(cardToEdit) {
    const modalCard = document.getElementById('modal-inventory-card');
    const titleModal = document.getElementById('modal-inv-card-title');
    const groupVehicle = document.getElementById('group-inv-vehicle');

    CardInventoryState.tempPlasticBase64 = cardToEdit ? cardToEdit.plasticImage || '' : '';
    CardInventoryState.tempRegFrontBase64 = cardToEdit ? cardToEdit.regFrontImage || '' : '';
    CardInventoryState.tempRegBackBase64 = cardToEdit ? cardToEdit.regBackImage || '' : '';

    if (cardToEdit) {
        titleModal.textContent = 'Editar Tarjeta de Inventario';
        document.getElementById('input-inv-card-id').value = cardToEdit.id;
        document.getElementById('select-inv-card-type').value = cardToEdit.type || 'combustible';
        document.getElementById('select-inv-card-bank').value = cardToEdit.bank || 'BANPRO';
        document.getElementById('input-inv-card-number').value = cardToEdit.cardNumber || '';
        document.getElementById('select-inv-card-status').value = cardToEdit.status || 'Activa';
        document.getElementById('input-inv-holder-name').value = cardToEdit.holderName || '';
        document.getElementById('input-inv-holder-code').value = cardToEdit.holderCode || '';
        document.getElementById('input-inv-vehicle-plate').value = cardToEdit.vehiclePlate || '';
        document.getElementById('input-inv-vehicle-reg').value = cardToEdit.vehicleReg || '';
        document.getElementById('textarea-inv-notes').value = cardToEdit.notes || '';

        // Plastic Preview
        const imgPlasticPrev = document.getElementById('img-inv-plastic-preview');
        const containerPlasticPrev = document.getElementById('inv-plastic-preview-container');
        if (cardToEdit.plasticImage && imgPlasticPrev && containerPlasticPrev) {
            imgPlasticPrev.src = cardToEdit.plasticImage;
            containerPlasticPrev.style.display = 'block';
        } else if (containerPlasticPrev) {
            containerPlasticPrev.style.display = 'none';
        }

        // Reg Front Preview
        const imgRegFrontPrev = document.getElementById('img-inv-reg-front-preview');
        const containerRegFrontPrev = document.getElementById('inv-reg-front-preview-container');
        if (cardToEdit.regFrontImage && imgRegFrontPrev && containerRegFrontPrev) {
            imgRegFrontPrev.src = cardToEdit.regFrontImage;
            containerRegFrontPrev.style.display = 'block';
        } else if (containerRegFrontPrev) {
            containerRegFrontPrev.style.display = 'none';
        }

        // Reg Back Preview
        const imgRegBackPrev = document.getElementById('img-inv-reg-back-preview');
        const containerRegBackPrev = document.getElementById('inv-reg-back-preview-container');
        if (cardToEdit.regBackImage && imgRegBackPrev && containerRegBackPrev) {
            imgRegBackPrev.src = cardToEdit.regBackImage;
            containerRegBackPrev.style.display = 'block';
        } else if (containerRegBackPrev) {
            containerRegBackPrev.style.display = 'none';
        }
    } else {
        titleModal.textContent = 'Registrar Nueva Tarjeta';
        document.getElementById('form-inventory-card').reset();
        document.getElementById('input-inv-card-id').value = '';

        document.getElementById('inv-plastic-preview-container').style.display = 'none';
        document.getElementById('inv-reg-front-preview-container').style.display = 'none';
        document.getElementById('inv-reg-back-preview-container').style.display = 'none';
    }

    const selectType = document.getElementById('select-inv-card-type');
    if (selectType.value === 'combustible') {
        groupVehicle.style.display = 'block';
    } else {
        groupVehicle.style.display = 'none';
    }

    modalCard.classList.add('active');
}

// Generate Corporate Inventory PDF Report
function generateCardInventoryPdfReport() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('Biblioteca jsPDF no disponible', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

    const totalCards = CardInventoryState.cards.length;
    const fuelCards = CardInventoryState.cards.filter(c => c.type === 'combustible').length;
    const corpCards = CardInventoryState.cards.filter(c => c.type === 'corporativa').length;
    const issueCards = CardInventoryState.cards.filter(c => c.status !== 'Activa').length;

    // Header Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text('SILVA INTERNACIONAL S.A.', 14, 15);

    doc.setFontSize(11);
    doc.setTextColor(99, 102, 241);
    doc.text('INVENTARIO GENERAL DE TARJETAS Y ASIGNACIÓN DE VEHÍCULOS', 14, 21);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const currentDate = new Date().toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.text(`Fecha de Emisión: ${currentDate}  |  Generado por: Módulo de Gestión FinControl`, 14, 26);

    // Summary Metric Badges
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 30, 250, 12, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(`Total Tarjetas: ${totalCards}`, 20, 37.5);
    doc.text(`Tarjetas Combustible (Vehículos): ${fuelCards}`, 80, 37.5);
    doc.text(`Tarjetas Corporativas: ${corpCards}`, 160, 37.5);
    doc.setTextColor(239, 68, 68);
    doc.text(`Alertas/Reemplazo: ${issueCards}`, 225, 37.5);

    // Table Mapping
    const tableBody = CardInventoryState.cards.map((c, idx) => [
        (idx + 1).toString(),
        c.type === 'combustible' ? 'Combustible' : 'Corporativa',
        `**** ${c.cardNumber}\n(${c.bank || 'BANPRO'})`,
        `${c.holderName || 'N/D'}`,
        c.holderCode || 'N/D',
        c.type === 'combustible' ? (c.vehiclePlate || 'N/D') : 'N/A',
        c.type === 'combustible' ? (c.vehicleReg || 'N/D') : 'N/A',
        c.status || 'Activa',
        c.notes || '-'
    ]);

    doc.autoTable({
        startY: 42,
        head: [['#', 'Tipo', 'N° Tarjeta / Banco', 'Responsable', 'Cód. Empleado', 'Placa Vehículo', 'N° Circulación', 'Estado', 'Observaciones']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center'
        },
        styles: {
            fontSize: 7.5,
            cellPadding: 1.8,
            valign: 'middle'
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            1: { cellWidth: 23 },
            2: { cellWidth: 30 },
            3: { cellWidth: 42 },
            4: { cellWidth: 24, halign: 'center' },
            5: { cellWidth: 24, halign: 'center' },
            6: { cellWidth: 26, halign: 'center' },
            7: { cellWidth: 20, halign: 'center' },
            8: { cellWidth: 'auto' }
        },
        didDrawPage: (data) => {
            // Footer page numbers
            const str = `Página ${doc.internal.getNumberOfPages()}`;
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(str, doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 8);
        }
    });

    // Signature Area at bottom of main table page (Ensuring it fits on Page 1)
    let finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 135;
    if (finalY > doc.internal.pageSize.height - 25) {
        doc.addPage();
        finalY = 30;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);

    doc.line(30, finalY, 110, finalY);
    doc.text('Elaborado / Entregado por (Administración)', 32, finalY + 4.5);

    doc.line(160, finalY, 240, finalY);
    doc.text('Recibido / Verificación por (Contabilidad & Tesorería)', 162, finalY + 4.5);

    // Annex Section: Vehicle Documents & Circulation Images (Derecho & Revés)
    const cardsWithDocs = CardInventoryState.cards.filter(c => c.plasticImage || c.regFrontImage || c.regBackImage);

    if (cardsWithDocs.length > 0) {
        doc.addPage('landscape');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(30, 41, 59);
        doc.text('ANEXO: DOCUMENTOS DE SOPORTE, PLÁSTICOS Y CIRCULACIÓN DE VEHÍCULOS', 14, 15);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('Imágenes de tarjetas corporativas y circulación (Derecho y Revés) registradas en el sistema', 14, 20);

        let currentY = 25;
        const pageHeight = doc.internal.pageSize.height;

        cardsWithDocs.forEach((c) => {
            if (currentY + 58 > pageHeight - 15) {
                doc.addPage('landscape');
                currentY = 20;
            }

            // Draw Card Box
            doc.setDrawColor(203, 213, 225);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(14, currentY, 252, 54, 2, 2, 'FD');

            // Header Text inside Box
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(15, 23, 42);
            const titleLine = c.type === 'combustible'
                ? `PLACA: ${c.vehiclePlate || 'S/N'}   |   CIRCULACIÓN N°: ${c.vehicleReg || 'S/N'}`
                : `TARJETA CORPORATIVA: **** ${c.cardNumber} (${c.bank || 'BANPRO'})`;
            doc.text(titleLine, 18, currentY + 6.5);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text(`Responsable: ${c.holderName || 'N/D'} (Cód: ${c.holderCode || 'N/D'})   |   Estado: ${c.status || 'Activa'}`, 18, currentY + 11.5);

            let imgX = 18;
            const imgY = currentY + 14;
            const imgWidth = 74;
            const imgHeight = 35;

            // 1. Plástico Image
            if (c.plasticImage) {
                try {
                    doc.addImage(c.plasticImage, 'JPEG', imgX, imgY, imgWidth, imgHeight);
                    doc.setFontSize(7);
                    doc.setTextColor(99, 102, 241);
                    doc.text('Tarjeta (Plástico)', imgX + 2, imgY + imgHeight + 3);
                } catch(e) {}
            } else {
                doc.setDrawColor(226, 232, 240);
                doc.setFillColor(255, 255, 255);
                doc.rect(imgX, imgY, imgWidth, imgHeight, 'FD');
                doc.setFontSize(7.5);
                doc.setTextColor(148, 163, 184);
                doc.text('Sin Foto Plástico', imgX + 22, imgY + 18);
            }
            imgX += imgWidth + 8;

            // 2. Circulation Front (Derecho)
            if (c.type === 'combustible') {
                if (c.regFrontImage) {
                    try {
                        doc.addImage(c.regFrontImage, 'JPEG', imgX, imgY, imgWidth, imgHeight);
                        doc.setFontSize(7);
                        doc.setTextColor(16, 185, 129);
                        doc.text('Circulación (Derecho / Frente)', imgX + 2, imgY + imgHeight + 3);
                    } catch(e) {}
                } else {
                    doc.setDrawColor(226, 232, 240);
                    doc.setFillColor(255, 255, 255);
                    doc.rect(imgX, imgY, imgWidth, imgHeight, 'FD');
                    doc.setFontSize(7.5);
                    doc.setTextColor(148, 163, 184);
                    doc.text('Sin Foto Frente', imgX + 22, imgY + 18);
                }
                imgX += imgWidth + 8;

                // 3. Circulation Back (Revés)
                if (c.regBackImage) {
                    try {
                        doc.addImage(c.regBackImage, 'JPEG', imgX, imgY, imgWidth, imgHeight);
                        doc.setFontSize(7);
                        doc.setTextColor(245, 158, 11);
                        doc.text('Circulación (Revés / Reverso)', imgX + 2, imgY + imgHeight + 3);
                    } catch(e) {}
                } else {
                    doc.setDrawColor(226, 232, 240);
                    doc.setFillColor(255, 255, 255);
                    doc.rect(imgX, imgY, imgWidth, imgHeight, 'FD');
                    doc.setFontSize(7.5);
                    doc.setTextColor(148, 163, 184);
                    doc.text('Sin Foto Reverso', imgX + 22, imgY + 18);
                }
            }

            currentY += 58;
        });
    }

    doc.save(`Reporte_Inventario_Tarjetas_${new Date().toISOString().slice(0,10)}.pdf`);
    showToast('Reporte PDF de inventario generado con éxito', 'success');
}

// Export CSV for Excel
function exportCardInventoryCSV() {
    if (CardInventoryState.cards.length === 0) {
        showToast('No hay tarjetas registradas para exportar', 'warning');
        return;
    }

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'ID,Tipo,Tarjeta,Banco,Responsable,Codigo_Empleado,Placa_Vehiculo,Numero_Circulacion,Estado,Observaciones,Ultima_Actualizacion\n';

    CardInventoryState.cards.forEach(c => {
        const row = [
            `"${c.id}"`,
            `"${c.type}"`,
            `"${c.cardNumber}"`,
            `"${c.bank}"`,
            `"${(c.holderName || '').replace(/"/g, '""')}"`,
            `"${c.holderCode || ''}"`,
            `"${c.vehiclePlate || ''}"`,
            `"${c.vehicleReg || ''}"`,
            `"${c.status || ''}"`,
            `"${(c.notes || '').replace(/"/g, '""')}"`,
            `"${c.updatedAt || ''}"`
        ];
        csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Inventario_Tarjetas_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exportación a Excel (CSV) completada', 'success');
}
