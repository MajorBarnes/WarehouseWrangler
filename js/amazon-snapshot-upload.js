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
    if (userData) {
        document.getElementById('userDisplay').textContent = `👤 ${userData.username}`;
    }

    // Setup logout
    document.getElementById('logoutBtn').addEventListener('click', function() {
        if (confirm('Are you sure you want to logout?')) {
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
        showError('Please select a CSV file.');
        return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        showError(`File is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
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
        showError('Please select a file first.');
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
            showErrorSection(data.error || 'Failed to parse file. Please check the format.');
        }

    } catch (error) {
        console.error('Upload error:', error);
        showErrorSection('Connection error. Please try again.');
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
    document.getElementById('summaryDate').textContent = data.snapshotDate || 'N/A';
    document.getElementById('summaryProducts').textContent = data.statistics.totalProducts || 0;
    document.getElementById('summaryBoxes').textContent = data.statistics.totalBoxes || 0;
    document.getElementById('summaryRows').textContent = data.statistics.rowsProcessed || 0;

    // Show warnings if any
    if (data.warnings && data.warnings.length > 0) {
        const warningsCard = document.getElementById('warningsCard');
        const warningsList = document.getElementById('warningsList');
        
        warningsList.innerHTML = data.warnings.map(w => 
            `<li><strong>Line ${w.line}:</strong> ${escapeHtml(w.message)}</li>`
        ).join('');
        
        warningsCard.classList.remove('hidden');
    }

    // Render preview table
    renderPreviewTable(data.products);
}

function renderPreviewTable(products) {
    const tbody = document.getElementById('previewTableBody');
    const limit = Math.min(PREVIEW_LIMIT, products.length);

    const rows = products.slice(0, limit).map((item) => {
        const statusClass = item.available_boxes > 0 ? 'badge-single' : 'badge-mixed';
        const statusText = item.available_boxes > 0 ? '✓ In Stock' : '⚠️ Out of Stock';

        return `
            <tr>
                <td><strong>${escapeHtml(item.fnsku)}</strong></td>
                <td>${escapeHtml(item.sku || 'N/A')}</td>
                <td>${escapeHtml(item.product_name || 'Unknown')}</td>
                <td style="text-align: center; font-weight: bold;">${item.available_boxes}</td>
                <td><span class="badge-type ${statusClass}">${statusText}</span></td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rows;

    // Add "showing X of Y" info if truncated
    if (products.length > limit) {
        tbody.innerHTML += `
            <tr>
                <td colspan="5" style="text-align: center; color: #666; font-style: italic; padding: 20px;">
                    Showing first ${limit} of ${products.length} products...
                </td>
            </tr>
        `;
    }
}

// ============================================================================
// CONFIRM & IMPORT
// ============================================================================

async function handleConfirm() {
    if (!parsedData) {
        showError('No data to import.');
        return;
    }

    const confirmMessage = `Are you sure you want to import this snapshot?\n\n` +
                          `Date: ${parsedData.snapshotDate}\n` +
                          `Products: ${parsedData.statistics.totalProducts}\n\n` +
                          `This will REPLACE existing data for this date.`;

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
            showErrorSection(data.error || 'Import failed. Please try again.');
        }

    } catch (error) {
        console.error('Import error:', error);
        showErrorSection('Connection error. Please try again.');
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
    document.getElementById('successDate').textContent = data.snapshotDate || 'N/A';
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
    alert('❌ ' + message);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
