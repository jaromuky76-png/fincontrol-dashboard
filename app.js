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
            AppState.settings = JSON.parse(savedSettings);
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
