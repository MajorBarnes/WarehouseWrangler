/**
 * WarehouseWrangler - LC Upload JavaScript
 * Handles LC file parsing, preview, and import with authentication
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = './api';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const PREVIEW_LIMIT = 20; // Show first 20 cartons in preview

// ============================================================================
// STATE
// ============================================================================

let selectedFile = null;
let parsedData = null;
let previewData = null;

// ============================================================================
// AUTH HELPERS
// ============================================================================

function getToken() {
    return localStorage.getItem('ww_auth_token');
}

function t(key, replacements, defaultValue) {
    const i18n = window.I18n;
    if (i18n?.t) {
        const hasDefault = defaultValue !== undefined;
        if (replacements !== undefined) {
            return hasDefault
                ? i18n.t(key, replacements, { defaultValue })
                : i18n.t(key, replacements);
        }
        return hasDefault ? i18n.t(key, undefined, { defaultValue }) : i18n.t(key);
    }
    return defaultValue ?? key;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initializeHeader();
    bindUploadControls();
});

function initializeHeader() {
    const userDisplay = document.getElementById('userDisplay');
    const userDataStr = localStorage.getItem('ww_user_data');

    if (userDisplay) {
        if (!userDisplay.dataset.userDisplayHydrated) {
            userDisplay.textContent = t('common.user.anonymous', undefined, 'User');
        }

        if (userDataStr) {
            try {
                const userData = JSON.parse(userDataStr);
                if (userData?.username) {
                    userDisplay.textContent = userData.username;
                    userDisplay.removeAttribute('data-i18n');
                    userDisplay.removeAttribute('data-i18n-attr');
                    userDisplay.removeAttribute('data-i18n-args');
                    userDisplay.dataset.userDisplayHydrated = 'true';
                }
            } catch (error) {
                console.error('Error parsing user data:', error);
            }
        }
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            const promptMessage = t(
                'common.prompts.logoutConfirm',
                undefined,
                'Are you sure you want to log out?'
            );
            if (confirm(promptMessage)) {
                localStorage.removeItem('ww_auth_token');
                localStorage.removeItem('ww_user_data');
                window.location.href = 'login.html';
            }
        });
    }
}

function bindUploadControls() {
    const selectFileBtn = document.getElementById('selectFileBtn');
    const lcFileInput = document.getElementById('lcFileInput');
    const clearFileBtn = document.getElementById('clearFileBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const confirmBtn = document.getElementById('confirmBtn');
    const showMixedOnly = document.getElementById('showMixedOnly');
    const uploadAnotherBtn = document.getElementById('uploadAnotherBtn');
    const viewInventoryBtn = document.getElementById('viewInventoryBtn');
    const tryAgainBtn = document.getElementById('tryAgainBtn');

    selectFileBtn?.addEventListener('click', () => lcFileInput?.click());
    lcFileInput?.addEventListener('change', handleFileSelect);
    clearFileBtn?.addEventListener('click', clearFile);
    uploadBtn?.addEventListener('click', handleUpload);
    cancelBtn?.addEventListener('click', resetToUpload);
    confirmBtn?.addEventListener('click', handleConfirm);
    showMixedOnly?.addEventListener('change', filterPreview);
    uploadAnotherBtn?.addEventListener('click', resetToUpload);
    viewInventoryBtn?.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    tryAgainBtn?.addEventListener('click', resetToUpload);
}

// ============================================================================
// FILE HANDLING
// ============================================================================

function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
        showError(
            t('lcUpload.errors.csvRequired', undefined, 'Please select a CSV file.')
        );
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        const maxSize = `${MAX_FILE_SIZE / 1024 / 1024}MB`;
        showError(
            t(
                'lcUpload.errors.fileTooLarge',
                { size: maxSize },
                `File is too large. Maximum size is ${maxSize}.`
            )
        );
        return;
    }

    selectedFile = file;

    const fileName = document.getElementById('fileName');
    const selectedFileInfo = document.getElementById('selectedFileInfo');
    const uploadBtn = document.getElementById('uploadBtn');

    if (fileName) fileName.textContent = file.name;
    selectedFileInfo?.classList.remove('hidden');
    uploadBtn?.classList.remove('hidden');
}

function clearFile() {
    selectedFile = null;
    const lcFileInput = document.getElementById('lcFileInput');
    if (lcFileInput) lcFileInput.value = '';
    document.getElementById('selectedFileInfo')?.classList.add('hidden');
    document.getElementById('uploadBtn')?.classList.add('hidden');
}

// ============================================================================
// UPLOAD & PARSE
// ============================================================================

async function handleUpload() {
    if (!selectedFile) {
        showError(
            t('lcUpload.errors.fileNotSelected', undefined, 'Please select a file first.')
        );
        return;
    }

    setUploadLoading(true);

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'preview');

        const response = await fetch(`${API_BASE}/upload/lc_file.php`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            parsedData = data.data;
            showPreview(data.data);
        } else {
            const errorMessage =
                data.error ||
                t(
                    'lcUpload.errors.parseFailed',
                    undefined,
                    'Failed to parse file. Please check the format.'
                );
            showErrorSection(errorMessage);
        }
    } catch (error) {
        console.error('Upload error:', error);
        showErrorSection(
            t('common.errors.connection', undefined, 'Connection error. Please try again.')
        );
    } finally {
        setUploadLoading(false);
    }
}

// ============================================================================
// PREVIEW DISPLAY
// ============================================================================

function showPreview(data) {
    document.getElementById('uploadSection').classList.add('hidden');
    document.getElementById('successSection').classList.add('hidden');
    document.getElementById('errorSection').classList.add('hidden');

    document.getElementById('previewSection').classList.remove('hidden');

    const notAvailableLabel = t('common.placeholders.notAvailable', undefined, 'N/A');
    document.getElementById('summaryPrefix').textContent = data.cartonPrefix || notAvailableLabel;
    document.getElementById('summaryCartons').textContent = data.statistics.totalCartons || 0;
    document.getElementById('summaryProducts').textContent = data.statistics.uniqueProducts || 0;
    document.getElementById('summaryRows').textContent = data.statistics.rowsProcessed || 0;
    document.getElementById('summaryWarnings').textContent = data.warnings.length || 0;

    const warningsCard = document.getElementById('warningsCard');
    const warningsList = document.getElementById('warningsList');

    if (warningsCard && warningsList) {
        if (data.warnings.length > 0) {
            warningsList.innerHTML = data.warnings
                .map((warning) => {
                    const defaultLine = `Line ${warning.line}`;
                    const lineLabel = escapeHtml(
                        t('lcUpload.warnings.lineLabel', { line: warning.line }, defaultLine)
                    );
                    return `
                <li>
                    <span class="material-icons-outlined" aria-hidden="true">report_problem</span>
                    <div>
                        <p class="warning-title">${lineLabel}</p>
                        <p>${escapeHtml(warning.message)}</p>
                    </div>
                </li>
            `;
                })
                .join('');
            warningsCard.classList.remove('hidden');
        } else {
            warningsList.innerHTML = '';
            warningsCard.classList.add('hidden');
        }
    }

    previewData = preparePreviewData(data.cartons);
    renderPreviewTable(previewData);
}

function preparePreviewData(cartons) {
    const cartonMap = new Map();

    cartons.forEach((carton) => {
        if (!cartonMap.has(carton.cartonNumber)) {
            cartonMap.set(carton.cartonNumber, []);
        }
        cartonMap.get(carton.cartonNumber).push(carton);
    });

    const preview = [];
    cartonMap.forEach((products, cartonNumber) => {
        products.forEach((product, index) => {
            preview.push({
                ...product,
                cartonNumber,
                isMixed: products.length > 1,
                isFirstInGroup: index === 0
            });
        });
    });

    return preview;
}

function renderPreviewTable(data) {
    const tbody = document.getElementById('previewTableBody');
    if (!tbody) return;

    const limit = Math.min(PREVIEW_LIMIT, data.length);
    const showMixedOnly = document.getElementById('showMixedOnly').checked;

    let filtered = data;
    if (showMixedOnly) {
        filtered = data.filter((item) => item.isMixed);
    }

    if (filtered.length === 0) {
        const emptyMessage = escapeHtml(
            t(
                'lcUpload.preview.table.empty',
                undefined,
                'No entries match the current filters.'
            )
        );
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="table-footnote">${emptyMessage}</td>
            </tr>
        `;
        return;
    }

    const rowsMarkup = filtered.slice(0, limit).map((item) => {
        const badgeClass = item.isMixed ? 'type-badge type-badge--mixed' : 'type-badge type-badge--single';
        const badgeIcon = item.isMixed ? 'call_split' : 'inventory_2';
        const badgeKey = item.isMixed
            ? 'lcUpload.preview.table.badges.mixed'
            : 'lcUpload.preview.table.badges.single';
        const badgeLabel = escapeHtml(
            t(
                badgeKey,
                undefined,
                item.isMixed ? 'Mixed carton' : 'Single carton'
            )
        );
        const rowClass = item.isMixed ? 'is-mixed' : '';
        const boxesValue = item.boxes ?? '';
        const productDisplay = item.productName || item.sku || t(
            'lcUpload.preview.productFallback',
            undefined,
            'Unknown product'
        );

        return `
            <tr class="${rowClass}">
                <td><span class="code-text">${escapeHtml(item.cartonNumber)}</span></td>
                <td><span class="code-text">${escapeHtml(item.fnsku)}</span></td>
                <td>${escapeHtml(productDisplay)}</td>
                <td class="numeric">${escapeHtml(boxesValue)}</td>
                <td>
                    <span class="${badgeClass}">
                        <span class="material-icons-outlined" aria-hidden="true">${badgeIcon}</span>
                        <span>${badgeLabel}</span>
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    const truncated = filtered.length > limit;
    if (truncated) {
        const defaultMessage = `Showing only the first ${limit} of ${filtered.length} entries.`;
        const truncatedMessage = escapeHtml(
            t('lcUpload.preview.table.truncated', { shown: limit, total: filtered.length }, defaultMessage)
        );
        tbody.innerHTML = `${rowsMarkup}
        <tr>
            <td colspan="5" class="table-footnote">${truncatedMessage}</td>
        </tr>`;
    } else {
        tbody.innerHTML = rowsMarkup;
    }
}

function filterPreview() {
    if (previewData) {
        renderPreviewTable(previewData);
    }
}

// ============================================================================
// CONFIRM & IMPORT
// ============================================================================

async function handleConfirm() {
    if (!parsedData) {
        showError(t('lcUpload.errors.noData', undefined, 'No data to import.'));
        return;
    }

    const confirmMessage = t(
        'lcUpload.prompts.confirmImport',
        { count: parsedData.statistics.totalCartons },
        `Are you sure you want to import ${parsedData.statistics.totalCartons} cartons to Incoming warehouse?`
    );

    if (!confirm(confirmMessage)) {
        return;
    }

    setConfirmLoading(true);

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'confirm');

        const response = await fetch(`${API_BASE}/upload/lc_file.php`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(data.data);
        } else {
            const errorMessage =
                data.error ||
                t('lcUpload.errors.importFailed', undefined, 'Import failed. Please try again.');
            showErrorSection(errorMessage);
        }
    } catch (error) {
        console.error('Import error:', error);
        showErrorSection(
            t('common.errors.connection', undefined, 'Connection error. Please try again.')
        );
    } finally {
        setConfirmLoading(false);
    }
}

// ============================================================================
// SUCCESS & ERROR DISPLAY
// ============================================================================

function showSuccess(data) {
    document.getElementById('previewSection').classList.add('hidden');
    document.getElementById('errorSection').classList.add('hidden');

    document.getElementById('successSection').classList.remove('hidden');

    document.getElementById('successCartons').textContent = data.cartonsCreated || 0;
    document.getElementById('successProducts').textContent = data.productsUpdated || 0;
}

function showErrorSection(message) {
    document.getElementById('uploadSection').classList.add('hidden');
    document.getElementById('previewSection').classList.add('hidden');
    document.getElementById('successSection').classList.add('hidden');

    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorSection').classList.remove('hidden');
}

// ============================================================================
// UI HELPERS
// ============================================================================

function setUploadLoading(isLoading) {
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadBtnText = document.getElementById('uploadBtnText');
    const uploadSpinner = document.getElementById('uploadSpinner');

    if (!uploadBtn || !uploadBtnText || !uploadSpinner) return;

    uploadBtn.disabled = isLoading;
    uploadBtnText.classList.toggle('hidden', isLoading);
    uploadSpinner.classList.toggle('hidden', !isLoading);
}

function setConfirmLoading(isLoading) {
    const confirmBtn = document.getElementById('confirmBtn');
    const confirmBtnText = document.getElementById('confirmBtnText');
    const confirmSpinner = document.getElementById('confirmSpinner');
    const cancelBtn = document.getElementById('cancelBtn');

    if (confirmBtn) confirmBtn.disabled = isLoading;
    confirmBtnText?.classList.toggle('hidden', isLoading);
    confirmSpinner?.classList.toggle('hidden', !isLoading);
    if (cancelBtn) cancelBtn.disabled = isLoading;
}

function resetToUpload() {
    document.getElementById('previewSection').classList.add('hidden');
    document.getElementById('successSection').classList.add('hidden');
    document.getElementById('errorSection').classList.add('hidden');

    document.getElementById('uploadSection').classList.remove('hidden');

    selectedFile = null;
    parsedData = null;
    previewData = null;

    clearFile();

    const warningsCard = document.getElementById('warningsCard');
    const warningsList = document.getElementById('warningsList');
    warningsCard?.classList.add('hidden');
    if (warningsList) warningsList.innerHTML = '';
}

function showError(message) {
    const alertText = t(
        'common.alerts.error',
        { message },
        `Error: ${message}`
    );
    alert(alertText);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}
