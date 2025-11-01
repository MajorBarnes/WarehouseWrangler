/**
 * WarehouseWrangler - Amazon Snapshot Upload JavaScript
 * Handles Amazon inventory snapshot parsing, preview, and import with authentication
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = './api';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const PREVIEW_LIMIT = 20; // Show first 20 products in preview

// ============================================================================
// STATE
// ============================================================================

let selectedFile = null;
let parsedData = null;

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
// AUTH HELPERS (Same pattern as lc-upload.js)
// ============================================================================

function getToken() {
    return localStorage.getItem('ww_auth_token');
}

function getCurrentUser() {
    const data = localStorage.getItem('ww_user_data');
    return data ? JSON.parse(data) : null;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    // Setup header
    const userData = getCurrentUser();
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) {
        userDisplay.textContent = t('common.user.anonymous', undefined, 'User');
        if (userData?.username) {
            userDisplay.textContent = userData.username;
        }
    }

    // Setup logout
    document.getElementById('logoutBtn').addEventListener('click', function() {
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

    // Setup file input handlers
    document.getElementById('selectFileBtn').addEventListener('click', () => {
        document.getElementById('snapshotFileInput').click();
    });

    document.getElementById('snapshotFileInput').addEventListener('change', handleFileSelect);
    document.getElementById('clearFileBtn').addEventListener('click', clearFile);
    document.getElementById('uploadBtn').addEventListener('click', handleUpload);

    // Preview section handlers
    document.getElementById('cancelBtn').addEventListener('click', resetToUpload);
    document.getElementById('confirmBtn').addEventListener('click', handleConfirm);

    // Success section handlers
    document.getElementById('uploadAnotherBtn').addEventListener('click', resetToUpload);
    document.getElementById('viewDashboardBtn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // Error section handlers
    document.getElementById('tryAgainBtn').addEventListener('click', resetToUpload);
});

// ============================================================================
// FILE HANDLING
// ============================================================================

function handleFileSelect(event) {
    const file = event.target.files[0];
    
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showError(
            t('amazonSnapshotUpload.errors.csvRequired', undefined, 'Please select a CSV file.')
        );
        return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        const maxSize = `${MAX_FILE_SIZE / 1024 / 1024}MB`;
        showError(
            t(
                'amazonSnapshotUpload.errors.fileTooLarge',
                { size: maxSize },
                `File is too large. Maximum size is ${maxSize}.`
            )
        );
        return;
    }

    selectedFile = file;
    
    // Show file info
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('selectedFileInfo').classList.remove('hidden');
    document.getElementById('uploadBtn').classList.remove('hidden');
}

function clearFile() {
    selectedFile = null;
    document.getElementById('snapshotFileInput').value = '';
    document.getElementById('selectedFileInfo').classList.add('hidden');
    document.getElementById('uploadBtn').classList.add('hidden');
}

// ============================================================================
// UPLOAD & PARSE
// ============================================================================

async function handleUpload() {
    if (!selectedFile) {
        showError(
            t(
                'amazonSnapshotUpload.errors.fileNotSelected',
                undefined,
                'Please select a file first.'
            )
        );
        return;
    }

    setUploadLoading(true);

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'preview');

        const response = await fetch(`${API_BASE}/upload/amazon_snapshot.php`, {
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
                    'amazonSnapshotUpload.errors.parseFailed',
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
    // Hide upload section
    document.getElementById('uploadSection').classList.add('hidden');
    
    // Show preview section
    document.getElementById('previewSection').classList.remove('hidden');

    // Populate summary
    document.getElementById('summaryDate').textContent =
        data.snapshotDate || t('common.placeholders.notAvailable', undefined, 'N/A');
    document.getElementById('summaryProducts').textContent = data.statistics.totalProducts || 0;
    document.getElementById('summaryBoxes').textContent = data.statistics.totalBoxes || 0;
    document.getElementById('summaryRows').textContent = data.statistics.rowsProcessed || 0;

    // Show warnings if any
    const warningsCard = document.getElementById('warningsCard');
    const warningsList = document.getElementById('warningsList');

    if (data.warnings && data.warnings.length > 0) {
        warningsList.innerHTML = data.warnings.map(w => `
            <li>
                <span class="material-icons-outlined" aria-hidden="true">warning</span>
                <div>
                    <p class="warning-title">${escapeHtml(
                        t(
                            'amazonSnapshotUpload.warnings.lineLabel',
                            { line: w.line },
                            `Line ${w.line}`
                        )
                    )}</p>
                    <p>${escapeHtml(w.message)}</p>
                </div>
            </li>
        `).join('');

        warningsCard.classList.remove('hidden');
    } else {
        warningsList.innerHTML = '';
        warningsCard.classList.add('hidden');
    }

    // Render preview table
    renderPreviewTable(data.products);
}

function renderPreviewTable(products) {
    const tbody = document.getElementById('previewTableBody');
    const limit = Math.min(PREVIEW_LIMIT, products.length);

    const rows = products.slice(0, limit).map((item) => {
        const isAvailable = Number(item.available_boxes) > 0;
        const statusClass = isAvailable ? 'type-badge type-badge--single' : 'type-badge type-badge--mixed';
        const statusIcon = isAvailable ? 'check_circle' : 'report';
        const statusText = isAvailable
            ? t('amazonSnapshotUpload.preview.status.inStock', undefined, 'In Stock')
            : t('amazonSnapshotUpload.preview.status.outOfStock', undefined, 'Out of Stock');

        return `
            <tr>
                <td><strong>${escapeHtml(item.fnsku)}</strong></td>
                <td>${escapeHtml(
                    item.sku || t('common.placeholders.notAvailable', undefined, 'N/A')
                )}</td>
                <td>${escapeHtml(
                    item.product_name ||
                        t('amazonSnapshotUpload.preview.productFallback', undefined, 'Unknown')
                )}</td>
                <td class="numeric">${item.available_boxes}</td>
                <td>
                    <span class="${statusClass}">
                        <span class="material-icons-outlined" aria-hidden="true">${statusIcon}</span>
                        <span>${statusText}</span>
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rows;

    // Add "showing X of Y" info if truncated
    if (products.length > limit) {
        const truncatedMessage = t(
            'amazonSnapshotUpload.preview.table.truncated',
            { shown: limit, total: products.length },
            `Showing first ${limit} of ${products.length} products…`
        );
        tbody.innerHTML += `
            <tr>
                <td colspan="5" class="table-footnote">${escapeHtml(truncatedMessage)}</td>
            </tr>
        `;
    }
}

// ============================================================================
// CONFIRM & IMPORT
// ============================================================================

async function handleConfirm() {
    if (!parsedData) {
        showError(
            t('amazonSnapshotUpload.errors.noData', undefined, 'No data to import.')
        );
        return;
    }

    const confirmMessage = t(
        'amazonSnapshotUpload.prompts.confirmImport',
        {
            date: parsedData.snapshotDate,
            products: parsedData.statistics.totalProducts
        },
        `Are you sure you want to import this snapshot?\n\n` +
            `Date: ${parsedData.snapshotDate}\n` +
            `Products: ${parsedData.statistics.totalProducts}\n\n` +
            `This will replace existing data for this date.`
    );

    if (!confirm(confirmMessage)) {
        return;
    }

    setConfirmLoading(true);

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'confirm');

        const response = await fetch(`${API_BASE}/upload/amazon_snapshot.php`, {
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
                t(
                    'amazonSnapshotUpload.errors.importFailed',
                    undefined,
                    'Import failed. Please try again.'
                );
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
    // Hide preview
    document.getElementById('previewSection').classList.add('hidden');
    
    // Show success
    document.getElementById('successSection').classList.remove('hidden');
    
    // Populate stats
    document.getElementById('successProducts').textContent = data.productsImported || 0;
    document.getElementById('successDate').textContent =
        data.snapshotDate || t('common.placeholders.notAvailable', undefined, 'N/A');
}

function showErrorSection(message) {
    // Hide all other sections
    document.getElementById('uploadSection').classList.add('hidden');
    document.getElementById('previewSection').classList.add('hidden');
    
    // Show error
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorSection').classList.remove('hidden');
}

// ============================================================================
// UI HELPERS
// ============================================================================

function setUploadLoading(isLoading) {
    document.getElementById('uploadBtn').disabled = isLoading;
    document.getElementById('uploadBtnText').classList.toggle('hidden', isLoading);
    document.getElementById('uploadSpinner').classList.toggle('hidden', !isLoading);
}

function setConfirmLoading(isLoading) {
    document.getElementById('confirmBtn').disabled = isLoading;
    document.getElementById('confirmBtnText').classList.toggle('hidden', isLoading);
    document.getElementById('confirmSpinner').classList.toggle('hidden', !isLoading);
    document.getElementById('cancelBtn').disabled = isLoading;
}

function resetToUpload() {
    // Hide all sections
    document.getElementById('previewSection').classList.add('hidden');
    document.getElementById('successSection').classList.add('hidden');
    document.getElementById('errorSection').classList.add('hidden');
    
    // Show upload section
    document.getElementById('uploadSection').classList.remove('hidden');
    
    // Reset state
    selectedFile = null;
    parsedData = null;
    
    // Clear file input
    clearFile();
}

function showError(message) {
    const errorMessage = t('common.alerts.error', { message }, `Error: ${message}`);
    alert(errorMessage);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
