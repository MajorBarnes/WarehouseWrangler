/**
 * WarehouseWrangler - Shipment Management JavaScript
 */

// Configuration
const API_BASE = './api';
let currentShipments = [];
let currentFilters = {
    status: '',
    from: '',
    to: ''
};

// Current shipment being created/edited
let activeShipment = null;
let selectedBoxes = []; // Array of {shipment_content_id, carton_id, product_id, boxes_to_send, carton_number, product_name, pairs_per_box}
let availableCartons = [];

// Shipment to recall
let shipmentToRecall = null;

// ---------------------------------------
// Helpers
// ---------------------------------------
function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatTemplate(template, replacements) {
    if (typeof template !== 'string' || !replacements) {
        return template;
    }

    return template.replace(/\{(\w+)\}/g, (match, token) => {
        return Object.prototype.hasOwnProperty.call(replacements, token)
            ? replacements[token]
            : match;
    });
}

function translate(key, replacements, defaultValue) {
    const hasI18n = typeof I18n !== 'undefined' && I18n && typeof I18n.t === 'function';
    const fallback = defaultValue !== undefined ? defaultValue : key;

    if (!hasI18n) {
        return formatTemplate(fallback, replacements);
    }

    const options = defaultValue !== undefined ? { defaultValue } : undefined;
    const result = I18n.t(key, replacements, options);
    return formatTemplate(result, replacements);
}

function formatStatusText(status) {
    return String(status || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function isValidDateInput(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// Get token
function getToken() {
    return localStorage.getItem('ww_auth_token');
}

// Get current user data
function getCurrentUser() {
    const data = localStorage.getItem('ww_user_data');
    return data ? JSON.parse(data) : null;
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    initializeHeader();
    bindShipmentsControls();

    const shipmentDateInput = document.getElementById('shipmentDate');
    if (shipmentDateInput) {
        shipmentDateInput.valueAsDate = new Date();
    }

    loadShipments();

    document.addEventListener('click', handleGlobalActionClick);
});

function initializeHeader() {
    const userDisplay = document.getElementById('userDisplay');
    const userDataStr = localStorage.getItem('ww_user_data');

    if (userDisplay) {
        if (!userDisplay.dataset.userDisplayHydrated) {
            userDisplay.textContent = translate('common.user.anonymous', null, 'User');
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
            const message = translate('common.prompts.logoutConfirm', null, 'Are you sure you want to log out?');
            if (confirm(message)) {
                localStorage.removeItem('ww_auth_token');
                localStorage.removeItem('ww_user_data');
                window.location.href = 'login.html';
            }
        });
    }
}

function bindShipmentsControls() {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn?.addEventListener('click', () => loadShipments());

    const createBtn = document.getElementById('createShipmentBtn');
    createBtn?.addEventListener('click', openCreateShipmentModal);

    document.getElementById('applyFiltersBtn')?.addEventListener('click', applyFilters);
    document.getElementById('clearFiltersBtn')?.addEventListener('click', clearFilters);

    document.getElementById('createShipmentForm')?.addEventListener('submit', handleCreateShipment);

    const proceedBtn = document.getElementById('proceedToSendBtn');
    if (proceedBtn) {
        proceedBtn.disabled = true;
    }
}

// ============================================================================
// API CALLS - SHIPMENTS
// ============================================================================

function setTableLoading(isLoading) {
    const loading = document.getElementById('shipmentsLoading');
    const table = document.getElementById('shipmentsTable');
    const empty = document.getElementById('shipmentsEmpty');

    if (isLoading) {
        loading?.classList.remove('is-hidden');
        table?.classList.add('is-hidden');
        empty?.classList.add('is-hidden');
    } else {
        loading?.classList.add('is-hidden');
    }
}

async function loadShipments(status = currentFilters.status, fromDate = currentFilters.from, toDate = currentFilters.to) {
    setTableLoading(true);

    try {
        currentFilters.status = status || '';
        currentFilters.from = fromDate || '';
        currentFilters.to = toDate || '';

        const token = getToken() || '';
        const params = new URLSearchParams();

        const normalizedStatus = (currentFilters.status || '').toLowerCase();
        if (normalizedStatus && normalizedStatus !== 'alle status' && normalizedStatus !== 'all' && normalizedStatus !== 'all status') {
            params.set('status', currentFilters.status);
        }
        if (isValidDateInput(currentFilters.from)) {
            params.set('from_date', currentFilters.from);
        }
        if (isValidDateInput(currentFilters.to)) {
            params.set('to_date', currentFilters.to);
        }

        const queryString = params.toString();
        const url = `${API_BASE}/shipments/get_shipments.php${queryString ? `?${queryString}` : ''}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Shipments fetch failed: HTTP ${response.status} — ${text.slice(0, 300)}`);
        }

        const data = await response.json();

        if (data.success) {
            currentShipments = data.shipments;
            updateSummaryCards(data.summary || {});
            renderShipmentsTable(data.shipments);
        } else {
            const message = translate('shipments.errors.loadFailed', { error: data.error || '' }, 'Failed to load shipments: {error}');
            showError(message);
            renderShipmentsTable([]);
        }
    } catch (error) {
        console.error('Load shipments error:', error);
        showError(translate('common.errors.connection', null, 'Connection error. Please try again.'));
        renderShipmentsTable([]);
    } finally {
        setTableLoading(false);
    }
}

async function createShipment(shipmentData) {
    try {
        const response = await fetch(`${API_BASE}/shipments/create_shipment.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(shipmentData)
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Create shipment error:', error);
        throw error;
    }
}

async function addBoxesToShipment(shipmentId, boxes) {
    try {
        const response = await fetch(`${API_BASE}/shipments/add_boxes_to_shipment.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                shipment_id: shipmentId,
                boxes: boxes
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Add boxes error:', error);
        throw error;
    }
}

async function sendShipment(shipmentId) {
    try {
        const response = await fetch(`${API_BASE}/shipments/send_shipment.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ shipment_id: shipmentId })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Send shipment error:', error);
        throw error;
    }
}

async function loadShipmentDetails(shipmentId) {
    try {
        const response = await fetch(`${API_BASE}/shipments/get_shipment_details.php?shipment_id=${shipmentId}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Load shipment details error:', error);
        throw error;
    }
}

async function recallShipment(shipmentId, notes) {
    try {
        const response = await fetch(`${API_BASE}/shipments/recall_shipment.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                shipment_id: shipmentId,
                notes: notes
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Recall shipment error:', error);
        throw error;
    }
}

// ============================================================================
// API CALLS - CARTONS (for box selection)
// ============================================================================

async function loadAvailableCartons() {
    try {
        // Use new endpoint that shows reserved quantities
        const excludeParam = activeShipment ? `?exclude_shipment_id=${activeShipment.shipment_id}` : '';
        const response = await fetch(`${API_BASE}/shipments/get_available_cartons.php${excludeParam}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await response.json();

        if (data.success) {
            availableCartons = data.cartons;
            renderAvailableCartons();
        }
    } catch (error) {
        console.error('Load available cartons error:', error);
    }
}

async function removeBoxesFromShipment(shipmentId, shipmentContentId) {
    try {
        const response = await fetch(`${API_BASE}/shipments/remove_boxes_from_shipment.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                shipment_id: shipmentId,
                shipment_content_id: shipmentContentId
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Remove boxes error:', error);
        throw error;
    }
}

// Confirm delete function:
async function confirmDeleteShipment(shipmentId, shipmentReference) {
    const prompt = translate('shipments.prompts.deletePrepared', { reference: shipmentReference }, 'Delete prepared shipment "{reference}"?\n\nThis will remove the shipment and free up all reserved boxes.');
    if (!confirm(prompt)) {
        return;
    }

    try {
        const result = await deleteShipment(shipmentId);

        if (result.success) {
            const successMessage = translate('shipments.delete.success', { reference: shipmentReference }, result.message || 'Shipment deleted successfully.');
            showSuccess(successMessage);
            loadShipments();
        } else {
            const fallback = result.error ? `Failed to delete shipment: ${result.error}` : 'Failed to delete shipment';
            const errorMessage = translate('shipments.delete.error', { error: result.error || '' }, fallback);
            showError(errorMessage);
        }
    } catch (error) {
        showError(translate('common.errors.connection', null, 'Connection error. Please try again.'));
    }
}

async function deleteShipment(shipmentId) {
    try {
        const response = await fetch(`${API_BASE}/shipments/delete_shipment.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ shipment_id: shipmentId })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Delete shipment error:', error);
        throw error;
    }
}

// ============================================================================
// UI RENDERING - SHIPMENTS TABLE
// ============================================================================

function updateSummaryCards(summary) {
    const totalEl = document.getElementById('totalShipments');
    const preparedEl = document.getElementById('preparedShipments');
    const sentEl = document.getElementById('sentShipments');
    const recalledEl = document.getElementById('recalledShipments');

    if (totalEl) totalEl.textContent = summary.total_shipments || 0;
    if (preparedEl) preparedEl.textContent = summary.prepared_count || 0;
    if (sentEl) sentEl.textContent = summary.sent_count || 0;
    if (recalledEl) recalledEl.textContent = summary.recalled_count || 0;

    syncStatusCardsWithFilter();
}

function renderShipmentsTable(shipments) {
    const table = document.getElementById('shipmentsTable');
    const tbody = document.getElementById('shipmentsTableBody');
    const emptyState = document.getElementById('shipmentsEmpty');
    const notAvailable = escapeHtml(translate('common.placeholders.notAvailable', null, 'N/A'));

    if (!tbody || !table) return;

    if (!shipments || shipments.length === 0) {
        tbody.innerHTML = '';
        table.classList.add('is-hidden');
        emptyState?.classList.remove('is-hidden');
        return;
    }

    table.classList.remove('is-hidden');
    emptyState?.classList.add('is-hidden');

    tbody.innerHTML = shipments.map(shipment => {
        const statusMarkup = renderStatusBadge(shipment.status);
        const actions = renderShipmentActions(shipment);
        const createdBy = shipment.created_by_user ? escapeHtml(shipment.created_by_user) : notAvailable;

        return `
            <tr data-shipment-id="${shipment.shipment_id}">
                <td><strong>${escapeHtml(shipment.shipment_reference)}</strong></td>
                <td>${formatDate(shipment.shipment_date)}</td>
                <td>${statusMarkup}</td>
                <td class="numeric">${shipment.carton_count || 0}</td>
                <td class="numeric">${shipment.product_count || 0}</td>
                <td class="numeric"><strong>${shipment.total_boxes || 0}</strong></td>
                <td>${createdBy}</td>
                <td class="actions-col">${actions}</td>
            </tr>
        `;
    }).join('');
}

function renderShipmentActions(shipment) {
    const actions = [];
    const viewLabel = translate('shipments.actions.view', null, 'View details');

    actions.push(`
        <button
            class="btn btn-surface icon-button"
            type="button"
            title="${escapeHtml(viewLabel)}"
            aria-label="${escapeHtml(viewLabel)}"
            data-action="view-shipment"
            data-shipment-id="${shipment.shipment_id}"
        >
            <span class="material-icons-outlined" aria-hidden="true">visibility</span>
        </button>
    `);

    if (shipment.status === 'prepared') {
        const continueLabel = translate('shipments.actions.continue', null, 'Resume shipment');
        actions.push(`
            <button
                class="btn btn-positive icon-button"
                type="button"
                aria-label="${escapeHtml(continueLabel)}"
                title="${escapeHtml(continueLabel)}"
                data-action="continue-shipment"
                data-shipment-id="${shipment.shipment_id}"
            >
                <span class="material-icons-outlined" aria-hidden="true">play_circle</span>
            </button>
        `);
    }

    if (shipment.status === 'sent') {
        const recallLabel = translate('shipments.actions.recall', null, 'Recall shipment');
        actions.push(`
            <button
                class="btn btn-danger icon-button"
                type="button"
                aria-label="${escapeHtml(recallLabel)}"
                title="${escapeHtml(recallLabel)}"
                data-action="recall"
                data-shipment-id="${shipment.shipment_id}"
                data-shipment-ref="${escapeHtml(shipment.shipment_reference || '')}"
            >
                <span class="material-icons-outlined" aria-hidden="true">undo</span>
            </button>
        `);
    }

    return `<div class="action-buttons">${actions.join('')}</div>`;
}

function renderStatusBadge(status) {
    const map = {
        'prepared': { icon: 'assignment_turned_in', key: 'shipments.statuses.prepared', defaultLabel: 'Prepared' },
        'sent': { icon: 'local_shipping', key: 'shipments.statuses.sent', defaultLabel: 'Sent' },
        'recalled': { icon: 'undo', key: 'shipments.statuses.recalled', defaultLabel: 'Recalled' }
    };

    const entry = map[status] || {
        icon: 'inventory_2',
        key: 'shipments.statuses.unknown',
        defaultLabel: status ? formatStatusText(status) : 'Unknown',
        replacements: { status: formatStatusText(status) || 'Unknown' }
    };
    const label = translate(entry.key, entry.replacements, entry.defaultLabel);
    const icon = entry.icon;

    return `
        <span class="status-badge status-${status}">
            <span class="material-icons-outlined" aria-hidden="true">${icon}</span>
            ${label}
        </span>
    `;
}

// ============================================================================
// CREATE SHIPMENT FLOW
// ============================================================================

function openCreateShipmentModal() {
    document.getElementById('createShipmentForm').reset();
    document.getElementById('shipmentDate').valueAsDate = new Date();
    document.getElementById('createShipmentModal').classList.remove('hidden');
}

function closeCreateShipmentModal() {
    document.getElementById('createShipmentModal').classList.add('hidden');
}

async function handleCreateShipment(e) {
    e.preventDefault();

    const shipmentData = {
        shipment_reference: document.getElementById('shipmentReference').value.trim(),
        shipment_date: document.getElementById('shipmentDate').value,
        notes: document.getElementById('shipmentNotes').value.trim()
    };

    try {
        const result = await createShipment(shipmentData);

        if (result.success) {
            const successMessage = translate('shipments.create.success', null, 'Shipment created successfully!');
            showSuccess(successMessage);
            closeCreateShipmentModal();

            // Open add boxes modal
            activeShipment = result.shipment;
            selectedBoxes = [];
            openAddBoxesModal();

        } else {
            const fallback = result.error ? `Failed to create shipment: ${result.error}` : 'Failed to create shipment';
            const errorMessage = translate('shipments.errors.create', { error: result.error || '' }, fallback);
            showError(errorMessage);
        }
    } catch (error) {
        showError(translate('common.errors.connection', null, 'Connection error. Please try again.'));
    }
}

// ============================================================================
// ADD BOXES FLOW
// ============================================================================

function openAddBoxesModal() {
    document.getElementById('currentShipmentRef').textContent = activeShipment.shipment_reference;
    document.getElementById('addBoxesModal').classList.remove('hidden');

    loadAvailableCartons();
    updateSelectedBoxesSummary();
    renderSelectedBoxesList();
}

function closeAddBoxesModal() {
    document.getElementById('addBoxesModal').classList.add('hidden');
    activeShipment = null;
    selectedBoxes = [];
    loadShipments(); // Refresh list
}

function renderAvailableCartons() {
    const container = document.getElementById('availableCartonsList');

    if (!container) {
        return;
    }

    const emptyMessage = translate('shipments.addBoxes.emptyCartons', null, 'No cartons with available inventory found.');
    const productsAriaLabel = translate('shipments.addBoxes.cartonProductsAria', null, 'Products in this carton');
    const emptyProductsLabel = translate('shipments.addBoxes.emptyProducts', null, 'No products with available inventory');
    const selectActionLabel = translate('shipments.addBoxes.actions.select', null, 'Select boxes');
    const addAllActionLabel = translate('shipments.addBoxes.actions.addAll', null, 'Add all boxes');

    if (availableCartons.length === 0) {
        container.innerHTML = `<div class="no-data">${escapeHtml(emptyMessage)}</div>`;
        return;
    }

    container.innerHTML = availableCartons.map(carton => {
        const products = Array.isArray(carton.products)
            ? carton.products.filter(product => Number(product.boxes_available_for_shipment ?? product.boxes_current) > 0)
            : [];

        const productCount = carton?.product_count ?? 0;
        const totalBoxes = carton?.total_boxes_current ?? 0;
        const cartonId = carton?.carton_id ?? '';
        const locationClass = escapeHtml((carton.location || '').toLowerCase());
        const locationLabel = translateLocationLabel(carton.location);
        const summary = translate('shipments.addBoxes.cartonSummary', { count: productCount, boxes: totalBoxes }, '{count} products • {boxes} boxes available');

        const artikelBadges = products
            .map(product => {
                const displayLabel = product.artikel || product.product_name || '';
                if (!displayLabel) {
                    return '';
                }

                const titleAttr = product.product_name
                    ? ` title="${escapeHtml(product.product_name)}"`
                    : '';

                return `<span class="carton-product-badge"${titleAttr}>${escapeHtml(displayLabel)}</span>`;
            })
            .filter(Boolean)
            .join('');

        const productsMarkup = artikelBadges
            ? `<div class="carton-products" aria-label="${escapeHtml(productsAriaLabel)}">${artikelBadges}</div>`
            : `<div class="carton-products carton-products--empty">${escapeHtml(emptyProductsLabel)}</div>`;

        return `
            <div class="carton-card" data-carton-id="${escapeHtml(String(cartonId))}">
                <div class="carton-header">
                    <strong>${escapeHtml(carton.carton_number)}</strong>
                    <span class="location-badge location-${locationClass}">
                        ${renderLocationIcon(carton.location)}
                        ${escapeHtml(locationLabel)}
                    </span>
                </div>
                <div class="carton-info">
                    ${escapeHtml(summary)}
                </div>
                ${productsMarkup}
                <div class="carton-actions">
                    <button class="btn btn-primary btn-small" type="button" data-action="select-carton" data-carton-id="${escapeHtml(String(cartonId))}">
                        <span class="material-icons-outlined" aria-hidden="true">add_box</span>
                        <span>${escapeHtml(selectActionLabel)}</span>
                    </button>
                    <button class="btn btn-secondary btn-small" type="button" data-action="add-all-boxes" data-carton-id="${escapeHtml(String(cartonId))}">
                        <span class="material-icons-outlined" aria-hidden="true">library_add</span>
                        <span>${escapeHtml(addAllActionLabel)}</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function selectBoxesFromCarton(cartonId) {
    const carton = availableCartons.find(c => c.carton_id === cartonId);
    if (!carton) {
        showError(translate('shipments.errors.cartonNotFound', null, 'Carton not found'));
        return;
    }
    showBoxSelectionDialog(carton, carton.products);
}

async function addAllBoxesFromCarton(cartonId) {
    if (!activeShipment || !activeShipment.shipment_id) {
        showError(translate('shipments.errors.shipmentRequired', null, 'Please select or create a shipment first.'));
        return;
    }

    const carton = availableCartons.find(c => c.carton_id === cartonId);
    if (!carton) {
        showError(translate('shipments.errors.cartonNotFound', null, 'Carton not found'));
        return;
    }

    const products = Array.isArray(carton.products) ? carton.products : [];
    const boxes = products
        .map(product => {
            const boxesAvailable = Number(product.boxes_available_for_shipment ?? product.boxes_current ?? 0);
            if (boxesAvailable <= 0) {
                return null;
            }

            return {
                carton_id: carton.carton_id,
                product_id: product.product_id,
                boxes_to_send: boxesAvailable,
                carton_number: carton.carton_number,
                product_name: product.product_name,
                pairs_per_box: Number(product.pairs_per_box ?? 0)
            };
        })
        .filter(Boolean);

    if (boxes.length === 0) {
        showError(translate('shipments.errors.noAvailableBoxes', null, 'No available boxes in this carton.'));
        return;
    }

    try {
        const result = await addBoxesToShipment(activeShipment.shipment_id, boxes);

        if (result.success) {
            const totalBoxes = boxes.reduce((sum, box) => sum + box.boxes_to_send, 0);
            const message = translate('shipments.addBoxes.success.addAll', { count: totalBoxes }, 'Added all available boxes ({count}).');
            showSuccess(message);
            await reloadShipmentContents();
            await loadAvailableCartons();
        } else {
            const fallback = result.error ? `Failed to add boxes to shipment: ${result.error}` : 'Failed to add boxes to shipment';
            const errorMessage = translate('shipments.errors.addBoxes', { error: result.error || '' }, fallback);
            showError(errorMessage);
            if (Array.isArray(result.warnings) && result.warnings.length > 0) {
                const warningTitle = translate('shipments.notifications.warningsTitle', null, 'Warnings:');
                alert(`${warningTitle}\n${result.warnings.join('\n')}`);
            }
        }
    } catch (error) {
        console.error('addAllBoxesFromCarton failed:', error);
        showError(translate('common.errors.connection', null, 'Connection error. Please try again.'));
    }
}

function showBoxSelectionDialog(carton, contents) {
    const title = translate('shipments.boxSelection.title', { carton: carton.carton_number }, 'Select boxes – {carton}');
    const quantityLabel = translate('shipments.boxSelection.quantityLabel', null, 'Boxes to send:');
    const cancelLabel = translate('common.actions.cancel', null, 'Cancel');
    const confirmLabel = translate('shipments.boxSelection.confirm', null, 'Add to shipment');

    const html = `
        <div class="box-selection-dialog">
            <h4>${escapeHtml(title)}</h4>
            ${contents.map(item => `
                <div class="product-selection">
                    <div class="product-info">
                        <strong>${escapeHtml(item.product_name)}</strong>
                        <div class="product-meta">${escapeHtml(translate('shipments.boxSelection.meta', {
                            fnsku: item.fnsku,
                            boxes: item.boxes_current,
                            pairs: item.pairs_current
                        }, 'FNSKU: {fnsku} • Available: {boxes} boxes ({pairs} pairs)'))}</div>
                    </div>
                    <div class="quantity-input">
                        <label>${escapeHtml(quantityLabel)}</label>
                        <input type="number"
                               id="boxes_${carton.carton_id}_${item.product_id}"
                               min="0"
                               max="${item.boxes_current}"
                               value="0"
                               data-carton-id="${carton.carton_id}"
                               data-product-id="${item.product_id}"
                               data-carton-number="${carton.carton_number}"
                               data-product-name="${item.product_name}"
                               data-pairs-per-box="${item.pairs_per_box}"
                               data-max="${item.boxes_current}">
                    </div>
                </div>
            `).join('')}
            <div class="dialog-actions">
                <button class="btn btn-secondary" type="button" data-action="cancel-box-selection">
                    <span class="material-icons-outlined" aria-hidden="true">close</span>
                    <span>${escapeHtml(cancelLabel)}</span>
                </button>
                <button class="btn btn-primary" type="button" data-action="confirm-box-selection">
                    <span class="material-icons-outlined" aria-hidden="true">add_circle</span>
                    <span>${escapeHtml(confirmLabel)}</span>
                </button>
            </div>
        </div>
    `;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.id = 'boxSelectionOverlay';
    overlay.innerHTML = `<div class="dialog-content">${html}</div>`;
    document.body.appendChild(overlay);
}

function closeBoxSelectionDialog() {
    const overlay = document.getElementById('boxSelectionOverlay');
    if (overlay) overlay.remove();
}

async function confirmBoxSelection() {
    const inputs = document.querySelectorAll('[id^="boxes_"]');
    const newBoxes = [];

    inputs.forEach(input => {
        const quantity = parseInt(input.value) || 0;
        if (quantity > 0) {
            newBoxes.push({
                carton_id: parseInt(input.dataset.cartonId),
                product_id: parseInt(input.dataset.productId),
                boxes_to_send: quantity,
                carton_number: input.dataset.cartonNumber,
                product_name: input.dataset.productName,
                pairs_per_box: parseInt(input.dataset.pairsPerBox)
            });
        }
    });

    if (newBoxes.length === 0) {
        showError(translate('shipments.errors.selectBoxes', null, 'Please select at least one box.'));
        return;
    }

    // IMMEDIATELY save to database
    try {
        const result = await addBoxesToShipment(activeShipment.shipment_id, newBoxes);

        if (result.success) {
            closeBoxSelectionDialog();
            const message = translate('shipments.addBoxes.success.added', { count: newBoxes.length }, 'Added {count} box selection(s) to shipment.');
            showSuccess(message);

            // Reload shipment details to get the saved content
            await reloadShipmentContents();

            // Reload available cartons to update reserved quantities
            await loadAvailableCartons();
        } else {
            const fallback = result.error ? `Failed to add boxes to shipment: ${result.error}` : 'Failed to add boxes to shipment';
            const errorMessage = translate('shipments.errors.addBoxes', { error: result.error || '' }, fallback);
            showError(errorMessage);
            if (result.warnings && result.warnings.length > 0) {
                const warningTitle = translate('shipments.notifications.warningsTitle', null, 'Warnings:');
                alert(`${warningTitle}\n${result.warnings.join('\n')}`);
            }
        }
    } catch (error) {
        showError(translate('common.errors.connection', null, 'Connection error. Please try again.'));
    }
}

async function reloadShipmentContents() {
    try {
        const details = await loadShipmentDetails(activeShipment.shipment_id);
        
        if (details.success) {
            // Update selectedBoxes with database content including shipment_content_id
            selectedBoxes = details.contents.map(c => ({
                shipment_content_id: c.shipment_content_id,  // IMPORTANT!
                carton_id: c.carton_id,
                product_id: c.product_id,
                boxes_to_send: c.boxes_sent,
                carton_number: c.carton_number,
                product_name: c.product_name,
                pairs_per_box: c.pairs_sent / c.boxes_sent
            }));
            
            updateSelectedBoxesSummary();
            renderSelectedBoxesList();
        }
    } catch (error) {
        console.error('Failed to reload shipment contents:', error);
    }
}

async function removeSelectedBox(index) {
    if (!Number.isInteger(index) || index < 0 || index >= selectedBoxes.length) {
        return;
    }

    const entry = selectedBoxes[index];
    if (!entry) {
        return;
    }

    if (entry.shipment_content_id) {
        if (!activeShipment || !activeShipment.shipment_id) {
            showError(translate('shipments.errors.missingContext', null, 'Shipment context missing. Please reload and try again.'));
            return;
        }

        try {
            await removeBoxFromShipment(entry.shipment_content_id);
        } catch (error) {
            console.error('removeBoxFromShipment failed:', error);
            showError(translate('shipments.errors.removeBoxes', null, 'Failed to remove boxes from shipment. Please try again.'));
        }
        return;
    }

    selectedBoxes.splice(index, 1);
    updateSelectedBoxesSummary();
    renderSelectedBoxesList();
}

function updateSelectedBoxesSummary() {
    const totalBoxes = selectedBoxes.reduce((sum, b) => sum + b.boxes_to_send, 0);
    const uniqueCartons = new Set(selectedBoxes.map(b => b.carton_id)).size;
    const uniqueProducts = new Set(selectedBoxes.map(b => b.product_id)).size;

    document.getElementById('totalBoxesSelected').textContent = totalBoxes;
    document.getElementById('totalCartonsSelected').textContent = uniqueCartons;
    document.getElementById('totalProductsSelected').textContent = uniqueProducts;

    // Show/enable proceed button if boxes selected
    const proceedBtn = document.getElementById('proceedToSendBtn');
    if (totalBoxes > 0) {
        proceedBtn.disabled = false;
        proceedBtn.querySelector('.btn-label').textContent = translate('shipments.addBoxes.proceedWithCount', { count: totalBoxes }, 'Review & send ({count})');
    } else {
        proceedBtn.disabled = true;
        proceedBtn.querySelector('.btn-label').textContent = translate('shipments.addBoxes.proceed', null, 'Review & send');
    }
}

function renderSelectedBoxesList() {
    const container = document.getElementById('selectedBoxesContainer');
    const tbody = document.getElementById('selectedBoxesBody');

    if (selectedBoxes.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    tbody.innerHTML = selectedBoxes.map((box, index) => `
        <tr>
            <td>${escapeHtml(box.carton_number)}</td>
            <td>${escapeHtml(box.product_name)}</td>
            <td class="text-center"><strong>${box.boxes_to_send}</strong></td>
            <td class="text-center">${box.boxes_to_send * box.pairs_per_box}</td>
            <td>
                <button class="btn btn-danger btn-small" type="button" data-action="remove-selected-box" data-index="${index}">
                    <span class="material-icons-outlined" aria-hidden="true">delete</span>
                    <span>${escapeHtml(translate('shipments.addBoxes.actions.remove', null, 'Remove'))}</span>
                </button>
            </td>
        </tr>
    `).join('');
}

async function removeBoxFromShipment(shipmentContentId) {
    const prompt = translate('shipments.prompts.removeBoxes', null, 'Remove these boxes from the shipment?');
    if (!confirm(prompt)) {
        return;
    }

    try {
        const result = await removeBoxesFromShipment(activeShipment.shipment_id, shipmentContentId);

        if (result.success) {
            const message = translate('shipments.addBoxes.success.removed', null, 'Boxes removed from shipment.');
            showSuccess(message);

            // Reload shipment contents
            await reloadShipmentContents();

            // Reload available cartons to update reserved quantities
            await loadAvailableCartons();
        } else {
            const fallback = result.error ? `Failed to remove boxes: ${result.error}` : 'Failed to remove boxes';
            const errorMessage = translate('shipments.errors.removeBoxesGeneric', { error: result.error || '' }, fallback);
            showError(errorMessage);
        }
    } catch (error) {
        showError(translate('common.errors.connection', null, 'Connection error. Please try again.'));
    }
}

// ============================================================================
// SEND SHIPMENT FLOW
// ============================================================================

async function proceedToSend() {
    if (selectedBoxes.length === 0) {
        showError(translate('shipments.errors.selectBoxesBeforeSend', null, 'Please select boxes before proceeding.'));
        return;
    }

    // Boxes are already in database, just show confirmation
    document.getElementById('addBoxesModal').classList.add('hidden');
    showSendConfirmation();
}

function showSendConfirmation() {
    const totalBoxes = selectedBoxes.reduce((sum, b) => sum + b.boxes_to_send, 0);
    const totalPairs = selectedBoxes.reduce((sum, b) => sum + (b.boxes_to_send * b.pairs_per_box), 0);
    const uniqueCartons = new Set(selectedBoxes.map(b => b.carton_id)).size;
    const uniqueProducts = new Set(selectedBoxes.map(b => b.product_id)).size;

    const confirmBtn = document.getElementById('confirmSendBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        const label = confirmBtn.querySelector('.btn-label');
        if (label) {
            label.textContent = translate('shipments.send.confirm', null, 'Send shipment');
        }
    }

    const shipmentHeading = translate('shipments.send.summary.heading', { reference: activeShipment.shipment_reference }, 'Shipment: {reference}');
    const dateLine = translate('shipments.send.summary.date', { date: formatDate(activeShipment.shipment_date) }, 'Date: {date}');
    const notesLine = activeShipment.notes
        ? `<p>${escapeHtml(translate('shipments.send.summary.notes', { notes: activeShipment.notes }, 'Notes: {notes}'))}</p>`
        : '';
    const totalBoxesLabel = translate('shipments.send.summary.totalBoxes', null, 'Total boxes:');
    const totalPairsLabel = translate('shipments.send.summary.totalPairs', null, 'Total pairs:');
    const cartonsLabel = translate('shipments.send.summary.cartons', null, 'Cartons affected:');
    const productsLabel = translate('shipments.send.summary.products', null, 'Products:');
    const breakdownTitle = translate('shipments.send.summary.breakdown', null, 'Breakdown by carton:');
    const tableHeaders = {
        carton: translate('shipments.addBoxes.table.carton', null, 'Carton'),
        product: translate('shipments.addBoxes.table.product', null, 'Product'),
        boxes: translate('shipments.addBoxes.table.boxes', null, 'Boxes'),
        pairs: translate('shipments.addBoxes.table.pairs', null, 'Pairs')
    };

    const summaryHtml = `
        <div class="confirm-details">
            <h4>${escapeHtml(shipmentHeading)}</h4>
            <p>${escapeHtml(dateLine)}</p>
            ${notesLine}
        </div>

        <div class="confirm-totals">
            <div class="total-item">
                <span class="label">${escapeHtml(totalBoxesLabel)}</span>
                <span class="value">${totalBoxes}</span>
            </div>
            <div class="total-item">
                <span class="label">${escapeHtml(totalPairsLabel)}</span>
                <span class="value">${totalPairs}</span>
            </div>
            <div class="total-item">
                <span class="label">${escapeHtml(cartonsLabel)}</span>
                <span class="value">${uniqueCartons}</span>
            </div>
            <div class="total-item">
                <span class="label">${escapeHtml(productsLabel)}</span>
                <span class="value">${uniqueProducts}</span>
            </div>
        </div>

        <div class="confirm-breakdown">
            <h4>${escapeHtml(breakdownTitle)}</h4>
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>${escapeHtml(tableHeaders.carton)}</th>
                        <th>${escapeHtml(tableHeaders.product)}</th>
                        <th>${escapeHtml(tableHeaders.boxes)}</th>
                        <th>${escapeHtml(tableHeaders.pairs)}</th>
                    </tr>
                </thead>
                <tbody>
                    ${selectedBoxes.map(box => `
                        <tr>
                            <td>${escapeHtml(box.carton_number)}</td>
                            <td>${escapeHtml(box.product_name)}</td>
                            <td class="text-center">${box.boxes_to_send}</td>
                            <td class="text-center">${box.boxes_to_send * box.pairs_per_box}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('confirmSummary').innerHTML = summaryHtml;
    document.getElementById('sendShipmentModal').classList.remove('hidden');
}

function closeSendShipmentModal() {
    document.getElementById('sendShipmentModal').classList.add('hidden');
    // Reopen add boxes modal
    document.getElementById('addBoxesModal').classList.remove('hidden');
}

async function confirmSendShipment() {
    const confirmBtn = document.getElementById('confirmSendBtn');
    const label = confirmBtn?.querySelector('.btn-label');

    if (confirmBtn) {
        confirmBtn.disabled = true;
    }
    if (label) {
        label.textContent = translate('shipments.send.progress', null, 'Sending…');
    }

    try {
        const result = await sendShipment(activeShipment.shipment_id);

        if (result.success) {
            const successMessage = translate('shipments.send.success', null, result.message || 'Shipment sent successfully.');
            showSuccess(successMessage);

            if (label) {
                label.textContent = translate('shipments.send.confirm', null, 'Send shipment');
            }

            // Close all modals
            document.getElementById('sendShipmentModal').classList.add('hidden');

            // Reset state
            activeShipment = null;
            selectedBoxes = [];

            // Reload shipments
            loadShipments();

        } else {
            const fallback = result.error ? `Failed to send shipment: ${result.error}` : 'Failed to send shipment';
            const errorMessage = translate('shipments.errors.send', { error: result.error || '' }, fallback);
            showError(errorMessage);
            if (confirmBtn) confirmBtn.disabled = false;
            if (label) label.textContent = translate('shipments.send.confirm', null, 'Send shipment');
        }
    } catch (error) {
        showError(translate('common.errors.connection', null, 'Connection error. Please try again.'));
        if (confirmBtn) confirmBtn.disabled = false;
        if (label) label.textContent = translate('shipments.send.confirm', null, 'Send shipment');
    }
}

// ============================================================================
// CONTINUE SHIPMENT (for prepared shipments)
// ============================================================================

async function continueShipment(shipmentId) {
    try {
        const details = await loadShipmentDetails(shipmentId);

        if (!details.success) {
            const errorMessage = translate('shipments.errors.loadDetails', { error: details.error || '' }, 'Failed to load shipment details.');
            showError(errorMessage);
            return;
        }

        activeShipment = details.shipment;
        
        // Load existing boxes
        selectedBoxes = details.contents.map(c => ({
            shipment_content_id: c.shipment_content_id,
            carton_id: c.carton_id,
            product_id: c.product_id,
            boxes_to_send: c.boxes_sent,
            carton_number: c.carton_number,
            product_name: c.product_name,
            pairs_per_box: c.pairs_sent / c.boxes_sent // Calculate from pairs_sent
        }));

        openAddBoxesModal();

    } catch (error) {
        showError(translate('shipments.errors.loadShipment', null, 'Failed to load shipment.'));
    }
}

// ============================================================================
// VIEW SHIPMENT DETAILS
// ============================================================================

async function viewShipmentDetails(shipmentId) {
    try {
        const details = await loadShipmentDetails(shipmentId);

        if (!details.success) {
            const errorMessage = translate('shipments.errors.loadDetails', { error: details.error || '' }, 'Failed to load shipment details.');
            showError(errorMessage);
            return;
        }

        showShipmentDetailsModal(details);

    } catch (error) {
        showError(translate('shipments.errors.loadDetails', null, 'Failed to load shipment details.'));
    }
}

function showShipmentDetailsModal(data) {
    const shipment = data.shipment;
    const contents = data.contents;
    const summary = data.summary;
    const notAvailable = translate('common.placeholders.notAvailable', null, 'N/A');
    const infoTitle = translate('shipments.details.sections.info.title', null, 'Shipment information');
    const labels = {
        reference: translate('shipments.details.sections.info.reference', null, 'Reference:'),
        date: translate('shipments.details.sections.info.date', null, 'Date:'),
        status: translate('shipments.details.sections.info.status', null, 'Status:'),
        createdBy: translate('shipments.details.sections.info.createdBy', null, 'Created by:'),
        created: translate('shipments.details.sections.info.createdAt', null, 'Created:'),
        updated: translate('shipments.details.sections.info.updatedAt', null, 'Last updated:'),
        notes: translate('shipments.details.sections.info.notes', null, 'Notes:')
    };
    const summaryTitle = translate('shipments.details.sections.summary.title', null, 'Summary');
    const summaryLabels = {
        boxes: translate('shipments.details.sections.summary.totalBoxes', null, 'Total boxes'),
        pairs: translate('shipments.details.sections.summary.totalPairs', null, 'Total pairs'),
        cartons: translate('shipments.details.sections.summary.cartons', null, 'Cartons'),
        products: translate('shipments.details.sections.summary.products', null, 'Products')
    };
    const contentsTitle = translate('shipments.details.sections.contents.title', null, 'Contents');
    const tableHeaders = {
        carton: translate('shipments.details.table.headers.carton', null, 'Carton'),
        product: translate('shipments.details.table.headers.product', null, 'Product'),
        fnsku: translate('shipments.details.table.headers.fnsku', null, 'FNSKU'),
        boxes: translate('shipments.details.table.headers.boxesSent', null, 'Boxes sent'),
        pairs: translate('shipments.details.table.headers.pairsSent', null, 'Pairs sent')
    };

    const html = `
        <div class="details-section">
            <h4>${escapeHtml(infoTitle)}</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <label>${escapeHtml(labels.reference)}</label>
                    <strong>${escapeHtml(shipment.shipment_reference)}</strong>
                </div>
                <div class="detail-item">
                    <label>${escapeHtml(labels.date)}</label>
                    ${formatDate(shipment.shipment_date)}
                </div>
                <div class="detail-item">
                    <label>${escapeHtml(labels.status)}</label>
                    ${renderStatusBadge(shipment.status)}
                </div>
                <div class="detail-item">
                    <label>${escapeHtml(labels.createdBy)}</label>
                    ${escapeHtml(shipment.created_by_username || notAvailable)}
                </div>
                <div class="detail-item">
                    <label>${escapeHtml(labels.created)}</label>
                    ${formatDateTime(shipment.created_at)}
                </div>
                <div class="detail-item">
                    <label>${escapeHtml(labels.updated)}</label>
                    ${formatDateTime(shipment.updated_at)}
                </div>
            </div>
            ${shipment.notes ? `
                <div class="detail-item full-width">
                    <label>${escapeHtml(labels.notes)}</label>
                    <p>${escapeHtml(shipment.notes)}</p>
                </div>
            ` : ''}
        </div>

        <div class="details-section">
            <h4>${escapeHtml(summaryTitle)}</h4>
            <div class="totals-grid">
                <div class="total-item">
                    <div class="total-label">${escapeHtml(summaryLabels.boxes)}</div>
                    <div class="total-value">${summary.total_boxes}</div>
                </div>
                <div class="total-item">
                    <div class="total-label">${escapeHtml(summaryLabels.pairs)}</div>
                    <div class="total-value">${summary.total_pairs}</div>
                </div>
                <div class="total-item">
                    <div class="total-label">${escapeHtml(summaryLabels.cartons)}</div>
                    <div class="total-value">${summary.unique_cartons}</div>
                </div>
                <div class="total-item">
                    <div class="total-label">${escapeHtml(summaryLabels.products)}</div>
                    <div class="total-value">${summary.unique_products}</div>
                </div>
            </div>
        </div>

        <div class="details-section">
            <h4>${escapeHtml(contentsTitle)}</h4>
            <div class="contents-table-wrapper">
                <table class="contents-table">
                    <thead>
                        <tr>
                            <th>${escapeHtml(tableHeaders.carton)}</th>
                            <th>${escapeHtml(tableHeaders.product)}</th>
                            <th>${escapeHtml(tableHeaders.fnsku)}</th>
                            <th>${escapeHtml(tableHeaders.boxes)}</th>
                            <th>${escapeHtml(tableHeaders.pairs)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${contents.map(item => `
                            <tr>
                                <td>${escapeHtml(item.carton_number)}</td>
                                <td>${escapeHtml(item.product_name)}</td>
                                <td><code>${escapeHtml(item.fnsku)}</code></td>
                                <td class="text-center"><strong>${item.boxes_sent}</strong></td>
                                <td class="text-center">${item.pairs_sent}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('shipmentDetailsBody').innerHTML = html;
    document.getElementById('shipmentDetailsModal').classList.remove('hidden');
}

function closeDetailsModal() {
    document.getElementById('shipmentDetailsModal').classList.add('hidden');
}

// ============================================================================
// RECALL SHIPMENT
// ============================================================================

function openRecallModal(shipmentId, shipmentReference) {
    shipmentToRecall = shipmentId;
    document.getElementById('recallShipmentRef').textContent = shipmentReference;
    document.getElementById('recallNotes').value = '';
    document.getElementById('recallModal').classList.remove('hidden');
}

function closeRecallModal() {
    document.getElementById('recallModal').classList.add('hidden');
    shipmentToRecall = null;
}

async function confirmRecall() {
    const notes = document.getElementById('recallNotes').value.trim();

    if (!notes) {
        showError(translate('shipments.recall.errors.notesRequired', null, 'Please provide a reason for recall.'));
        return;
    }

    const prompt = translate('shipments.recall.confirmPrompt', null, 'Are you absolutely sure you want to recall this shipment?');
    if (!confirm(prompt)) {
        return;
    }

    try {
        const result = await recallShipment(shipmentToRecall, notes);

        if (result.success) {
            const successMessage = translate('shipments.recall.success', null, result.message || 'Shipment recalled successfully.');
            showSuccess(successMessage);
            closeRecallModal();
            loadShipments();
        } else {
            const fallback = result.error ? `Failed to recall shipment: ${result.error}` : 'Failed to recall shipment';
            const errorMessage = translate('shipments.recall.error', { error: result.error || '' }, fallback);
            showError(errorMessage);
        }
    } catch (error) {
        showError(translate('common.errors.connection', null, 'Connection error. Please try again.'));
    }
}

// ============================================================================
// FILTERS
// ============================================================================

function applyFilters() {
    currentFilters.status = document.getElementById('statusFilter').value;
    currentFilters.from = document.getElementById('fromDateFilter').value;
    currentFilters.to = document.getElementById('toDateFilter').value;

    syncStatusCardsWithFilter();
    loadShipments();
}

function clearFilters() {
    currentFilters = { status: '', from: '', to: '' };
    document.getElementById('statusFilter').value = '';
    document.getElementById('fromDateFilter').value = '';
    document.getElementById('toDateFilter').value = '';

    syncStatusCardsWithFilter();
    loadShipments();
}

function filterByStatus(status) {
    document.getElementById('statusFilter').value = status;
    currentFilters.status = status;
    loadShipments(status);

    syncStatusCardsWithFilter();
}

function handleGlobalActionClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) {
        return;
    }

    const action = target.dataset.action;

    switch (action) {
        case 'filter-status': {
            event.preventDefault();
            filterByStatus(target.dataset.status || '');
            break;
        }
        case 'close-create-modal': {
            event.preventDefault();
            closeCreateShipmentModal();
            break;
        }
        case 'close-add-boxes': {
            event.preventDefault();
            closeAddBoxesModal();
            break;
        }
        case 'proceed-to-send': {
            event.preventDefault();
            proceedToSend();
            break;
        }
        case 'close-send-shipment': {
            event.preventDefault();
            closeSendShipmentModal();
            break;
        }
        case 'confirm-send-shipment': {
            event.preventDefault();
            confirmSendShipment();
            break;
        }
        case 'view-shipment': {
            event.preventDefault();
            {
                const shipmentId = Number(target.dataset.shipmentId);
                if (!Number.isNaN(shipmentId)) {
                    viewShipmentDetails(shipmentId);
                }
            }
            break;
        }
        case 'continue-shipment': {
            event.preventDefault();
            {
                const shipmentId = Number(target.dataset.shipmentId);
                if (!Number.isNaN(shipmentId)) {
                    continueShipment(shipmentId);
                }
            }
            break;
        }
        case 'recall': {
            event.preventDefault();
            {
                const id = Number(target.dataset.shipmentId);
                const ref = target.dataset.shipmentRef || '';
                if (!Number.isNaN(id)) {
                    openRecallModal(id, ref);
                }
            }
            break;
        }
        case 'close-details': {
            event.preventDefault();
            closeDetailsModal();
            break;
        }
        case 'close-recall': {
            event.preventDefault();
            closeRecallModal();
            break;
        }
        case 'confirm-recall': {
            event.preventDefault();
            confirmRecall();
            break;
        }
        case 'select-carton': {
            event.preventDefault();
            {
                const cartonId = Number(target.dataset.cartonId);
                if (!Number.isNaN(cartonId)) {
                    selectBoxesFromCarton(cartonId);
                }
            }
            break;
        }
        case 'add-all-boxes': {
            event.preventDefault();
            {
                const cartonId = Number(target.dataset.cartonId);
                if (!Number.isNaN(cartonId)) {
                    addAllBoxesFromCarton(cartonId);
                }
            }
            break;
        }
        case 'cancel-box-selection': {
            event.preventDefault();
            closeBoxSelectionDialog();
            break;
        }
        case 'confirm-box-selection': {
            event.preventDefault();
            confirmBoxSelection();
            break;
        }
        case 'remove-selected-box': {
            event.preventDefault();
            {
                const index = Number(target.dataset.index);
                if (!Number.isNaN(index)) {
                    removeSelectedBox(index);
                }
            }
            break;
        }
        default:
            break;
    }
}

function resetStatusCards() {
    document.querySelectorAll('.status-card').forEach(card => {
        card.classList.remove('is-active');
        card.setAttribute('aria-pressed', 'false');
    });
}

function syncStatusCardsWithFilter() {
    resetStatusCards();
    if (!currentFilters.status) return;

    const target = document.querySelector(`.status-card[data-status="${currentFilters.status}"]`);
    if (target) {
        target.classList.add('is-active');
        target.setAttribute('aria-pressed', 'true');
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showSuccess(message) {
    const translated = translate('shipments.notifications.success', { message }, 'Success: {message}');
    alert(translated);
}

function showError(message) {
    const translated = translate('shipments.notifications.error', { message }, 'Error: {message}');
    alert(translated);
}

function formatDate(dateString) {
    const notAvailable = translate('common.placeholders.notAvailable', null, 'N/A');
    if (!dateString) return notAvailable;
    const date = new Date(dateString);
    const locale = typeof I18n !== 'undefined' && I18n && typeof I18n.getLocale === 'function'
        ? I18n.getLocale()
        : undefined;
    return date.toLocaleDateString(locale || undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDateTime(dateString) {
    const notAvailable = translate('common.placeholders.notAvailable', null, 'N/A');
    if (!dateString) return notAvailable;
    const date = new Date(dateString);
    const locale = typeof I18n !== 'undefined' && I18n && typeof I18n.getLocale === 'function'
        ? I18n.getLocale()
        : undefined;
    return date.toLocaleString(locale || undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderLocationIcon(location) {
    const icons = {
        'Incoming': 'move_to_inbox',
        'WML': 'inventory_2',
        'GMR': 'store'
    };
    const icon = icons[location] || 'inventory_2';
    return `<span class="material-icons-outlined" aria-hidden="true">${icon}</span>`;
}

function translateLocationLabel(location) {
    const map = {
        'Incoming': 'cartons.filters.location.incoming',
        'WML': 'cartons.filters.location.wml',
        'GMR': 'cartons.filters.location.gmr'
    };

    const key = map[location];
    return key ? translate(key, null, location) : location;
}
