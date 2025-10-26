/**
 * WarehouseWrangler - Shipment Management JavaScript
 */

// Configuration
const API_BASE = './api';
let currentShipments = [];
let currentFilters = {
    status: '',
    from_date: '',
    to_date: ''
};

// Current shipment being created/edited
let activeShipment = null;
let selectedBoxes = []; // Array of {shipment_content_id, carton_id, product_id, boxes_to_send, carton_number, product_name, pairs_per_box}
let availableCartons = [];

// Shipment to recall
let shipmentToRecall = null;

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
});

function initializeHeader() {
    const userDisplay = document.getElementById('userDisplay');
    const userDataStr = localStorage.getItem('ww_user_data');

    if (userDisplay) {
        userDisplay.textContent = 'Benutzer';

        if (userDataStr) {
            try {
                const userData = JSON.parse(userDataStr);
                if (userData?.username) {
                    userDisplay.textContent = userData.username;
                }
            } catch (error) {
                console.error('Error parsing user data:', error);
            }
        }
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
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

async function loadShipments() {
    setTableLoading(true);

    try {
        const params = new URLSearchParams();
        if (currentFilters.status) params.append('status', currentFilters.status);
        if (currentFilters.from_date) params.append('from_date', currentFilters.from_date);
        if (currentFilters.to_date) params.append('to_date', currentFilters.to_date);

        const queryString = params.toString() ? '?' + params.toString() : '';
        const response = await fetch(`${API_BASE}/shipments/get_shipments.php${queryString}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await response.json();

        if (data.success) {
            currentShipments = data.shipments;
            updateSummaryCards(data.summary || {});
            renderShipmentsTable(data.shipments);
        } else {
            showError('Failed to load shipments: ' + data.error);
            renderShipmentsTable([]);
        }
    } catch (error) {
        console.error('Load shipments error:', error);
        showError('Connection error. Please try again.');
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

        return `
            <tr data-shipment-id="${shipment.shipment_id}">
                <td><strong>${escapeHtml(shipment.shipment_reference)}</strong></td>
                <td>${formatDate(shipment.shipment_date)}</td>
                <td>${statusMarkup}</td>
                <td class="numeric">${shipment.carton_count || 0}</td>
                <td class="numeric">${shipment.product_count || 0}</td>
                <td class="numeric"><strong>${shipment.total_boxes || 0}</strong></td>
                <td>${escapeHtml(shipment.created_by_user || 'N/A')}</td>
                <td class="actions-col">${actions}</td>
            </tr>
        `;
    }).join('');
}

function renderShipmentActions(shipment) {
    const actions = [];

    actions.push(`
        <button
            class="btn btn-surface icon-button"
            type="button"
            data-tooltip="Details ansehen"
            aria-label="Details ansehen"
            onclick="viewShipmentDetails(${shipment.shipment_id})"
        >
            <span class="material-icons-outlined" aria-hidden="true">visibility</span>
        </button>
    `);

    if (shipment.status === 'prepared') {
        actions.push(`
            <button
                class="btn btn-positive icon-button"
                type="button"
                data-tooltip="Shipment fortsetzen"
                aria-label="Shipment fortsetzen"
                onclick="continueShipment(${shipment.shipment_id})"
            >
                <span class="material-icons-outlined" aria-hidden="true">play_circle</span>
            </button>
        `);
    }

    if (shipment.status === 'sent') {
        actions.push(`
            <button
                class="btn btn-danger icon-button"
                type="button"
                data-tooltip="Shipment zurückrufen"
                aria-label="Shipment zurückrufen"
                onclick="openRecallModal(${shipment.shipment_id}, ${JSON.stringify(shipment.shipment_reference || '')})"
            >
                <span class="material-icons-outlined" aria-hidden="true">undo</span>
            </button>
        `);
    }

    return `<div class="action-buttons">${actions.join('')}</div>`;
}

function renderStatusBadge(status) {
    const map = {
        'prepared': { icon: 'assignment_turned_in', label: 'Prepared' },
        'sent': { icon: 'local_shipping', label: 'Sent' },
        'recalled': { icon: 'undo', label: 'Recalled' }
    };

    const { icon, label } = map[status] || { icon: 'inventory_2', label: status || 'Unknown' };

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
            showSuccess('Shipment created successfully!');
            closeCreateShipmentModal();
            
            // Open add boxes modal
            activeShipment = result.shipment;
            selectedBoxes = [];
            openAddBoxesModal();
            
        } else {
            showError(result.error || 'Failed to create shipment');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
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
}

function closeAddBoxesModal() {
    document.getElementById('addBoxesModal').classList.add('hidden');
    activeShipment = null;
    selectedBoxes = [];
    loadShipments(); // Refresh list
}

function renderAvailableCartons() {
    const container = document.getElementById('availableCartonsList');
    
    if (availableCartons.length === 0) {
        container.innerHTML = '<div class="no-data">Keine Kartons mit verfügbarem Bestand gefunden.</div>';
        return;
    }

    container.innerHTML = availableCartons.map(carton => `
        <div class="carton-card" data-carton-id="${carton.carton_id}">
            <div class="carton-header">
                <strong>${escapeHtml(carton.carton_number)}</strong>
                <span class="location-badge location-${carton.location.toLowerCase()}">
                    ${renderLocationIcon(carton.location)}
                    ${escapeHtml(carton.location)}
                </span>
            </div>
            <div class="carton-info">
                ${carton.product_count} Produkte • ${carton.total_boxes_current} Boxen verfügbar
            </div>
            <button class="btn btn-primary btn-small" type="button" onclick="selectBoxesFromCarton(${carton.carton_id})">
                <span class="material-icons-outlined" aria-hidden="true">add_box</span>
                <span>Boxen auswählen</span>
            </button>
        </div>
    `).join('');
}

async function selectBoxesFromCarton(cartonId) {
    try {
        const details = await loadCartonDetails(cartonId);
        
        if (!details.success) {
            showError('Failed to load carton details');
            return;
        }

        showBoxSelectionDialog(details.carton, details.contents);
        
    } catch (error) {
        showError('Failed to load carton details');
    }
}

function showBoxSelectionDialog(carton, contents) {
    const html = `
        <div class="box-selection-dialog">
            <h4>Boxen auswählen – ${escapeHtml(carton.carton_number)}</h4>
            ${contents.map(item => `
                <div class="product-selection">
                    <div class="product-info">
                        <strong>${escapeHtml(item.product_name)}</strong>
                        <div class="product-meta">
                            FNSKU: ${escapeHtml(item.fnsku)} • Verfügbar: ${item.boxes_current} Boxen (${item.pairs_current} Paare)
                        </div>
                    </div>
                    <div class="quantity-input">
                        <label>Boxen zum Versand:</label>
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
                <button class="btn btn-secondary" type="button" onclick="closeBoxSelectionDialog()">
                    <span class="material-icons-outlined" aria-hidden="true">close</span>
                    <span>Abbrechen</span>
                </button>
                <button class="btn btn-primary" type="button" onclick="confirmBoxSelection()">
                    <span class="material-icons-outlined" aria-hidden="true">add_circle</span>
                    <span>Zum Shipment hinzufügen</span>
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

function confirmBoxSelection() {
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
        showError('Please select at least one box');
        return;
    }

    // Add to selected boxes
    newBoxes.forEach(newBox => {
        // Check if this carton/product combo already exists
        const existingIndex = selectedBoxes.findIndex(b => 
            b.carton_id === newBox.carton_id && b.product_id === newBox.product_id
        );

        if (existingIndex >= 0) {
            // Update quantity
            selectedBoxes[existingIndex].boxes_to_send += newBox.boxes_to_send;
        } else {
            selectedBoxes.push(newBox);
        }
    });

    closeBoxSelectionDialog();
    updateSelectedBoxesSummary();
    renderSelectedBoxesList();
    showSuccess(`Added ${newBoxes.length} box selection(s) to shipment`);
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
        proceedBtn.querySelector('.btn-label').textContent = `Prüfen & senden (${totalBoxes})`;
    } else {
        proceedBtn.disabled = true;
        proceedBtn.querySelector('.btn-label').textContent = 'Prüfen & senden';
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
                <button class="btn btn-danger btn-small" type="button" onclick="removeSelectedBox(${index})">
                    <span class="material-icons-outlined" aria-hidden="true">delete</span>
                    <span>Entfernen</span>
                </button>
            </td>
        </tr>
    `).join('');
}

function removeSelectedBox(index) {
    selectedBoxes.splice(index, 1);
    updateSelectedBoxesSummary();
    renderSelectedBoxesList();
}

// ============================================================================
// SEND SHIPMENT FLOW
// ============================================================================

async function proceedToSend() {
    if (selectedBoxes.length === 0) {
        showError('Please select boxes before proceeding');
        return;
    }

    // First, add the boxes to the shipment
    try {
        const result = await addBoxesToShipment(activeShipment.shipment_id, selectedBoxes);

        if (result.success) {
            // Close add boxes modal
            document.getElementById('addBoxesModal').classList.add('hidden');
            
            // Show send confirmation modal
            showSendConfirmation();
        } else {
            showError(result.error || 'Failed to add boxes to shipment');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    }
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
            label.textContent = 'Shipment senden';
        }
    }

    const summaryHtml = `
        <div class="confirm-details">
            <h4>Shipment: ${escapeHtml(activeShipment.shipment_reference)}</h4>
            <p>Date: ${formatDate(activeShipment.shipment_date)}</p>
            ${activeShipment.notes ? `<p>Notes: ${escapeHtml(activeShipment.notes)}</p>` : ''}
        </div>

        <div class="confirm-totals">
            <div class="total-item">
                <span class="label">Total Boxes:</span>
                <span class="value">${totalBoxes}</span>
            </div>
            <div class="total-item">
                <span class="label">Total Pairs:</span>
                <span class="value">${totalPairs}</span>
            </div>
            <div class="total-item">
                <span class="label">Cartons Affected:</span>
                <span class="value">${uniqueCartons}</span>
            </div>
            <div class="total-item">
                <span class="label">Products:</span>
                <span class="value">${uniqueProducts}</span>
            </div>
        </div>

        <div class="confirm-breakdown">
            <h4>Breakdown by Carton:</h4>
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>Carton</th>
                        <th>Product</th>
                        <th>Boxes</th>
                        <th>Pairs</th>
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
        label.textContent = 'Wird gesendet…';
    }

    try {
        const result = await sendShipment(activeShipment.shipment_id);

        if (result.success) {
            showSuccess(result.message);

            if (label) {
                label.textContent = 'Shipment senden';
            }

            // Close all modals
            document.getElementById('sendShipmentModal').classList.add('hidden');
            
            // Reset state
            activeShipment = null;
            selectedBoxes = [];
            
            // Reload shipments
            loadShipments();

        } else {
            showError(result.error || 'Failed to send shipment');
            if (confirmBtn) confirmBtn.disabled = false;
            if (label) label.textContent = 'Shipment senden';
        }
    } catch (error) {
        showError('Connection error. Please try again.');
        if (confirmBtn) confirmBtn.disabled = false;
        if (label) label.textContent = 'Shipment senden';
    }
}

// ============================================================================
// CONTINUE SHIPMENT (for prepared shipments)
// ============================================================================

async function continueShipment(shipmentId) {
    try {
        const details = await loadShipmentDetails(shipmentId);

        if (!details.success) {
            showError('Failed to load shipment details');
            return;
        }

        activeShipment = details.shipment;
        
        // Load existing boxes
        selectedBoxes = details.contents.map(c => ({
            carton_id: c.carton_id,
            product_id: c.product_id,
            boxes_to_send: c.boxes_sent,
            carton_number: c.carton_number,
            product_name: c.product_name,
            pairs_per_box: c.pairs_sent / c.boxes_sent // Calculate from pairs_sent
        }));

        openAddBoxesModal();
        
    } catch (error) {
        showError('Failed to load shipment');
    }
}

// ============================================================================
// VIEW SHIPMENT DETAILS
// ============================================================================

async function viewShipmentDetails(shipmentId) {
    try {
        const details = await loadShipmentDetails(shipmentId);
        
        if (!details.success) {
            showError('Failed to load shipment details');
            return;
        }

        showShipmentDetailsModal(details);
        
    } catch (error) {
        showError('Failed to load shipment details');
    }
}

function showShipmentDetailsModal(data) {
    const shipment = data.shipment;
    const contents = data.contents;
    const summary = data.summary;

    const html = `
        <div class="details-section">
            <h4>Shipment Information</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <label>Reference:</label>
                    <strong>${escapeHtml(shipment.shipment_reference)}</strong>
                </div>
                <div class="detail-item">
                    <label>Date:</label>
                    ${formatDate(shipment.shipment_date)}
                </div>
                <div class="detail-item">
                    <label>Status:</label>
                    ${renderStatusBadge(shipment.status)}
                </div>
                <div class="detail-item">
                    <label>Created By:</label>
                    ${escapeHtml(shipment.created_by_username || 'N/A')}
                </div>
                <div class="detail-item">
                    <label>Created:</label>
                    ${formatDateTime(shipment.created_at)}
                </div>
                <div class="detail-item">
                    <label>Last Updated:</label>
                    ${formatDateTime(shipment.updated_at)}
                </div>
            </div>
            ${shipment.notes ? `
                <div class="detail-item full-width">
                    <label>Notes:</label>
                    <p>${escapeHtml(shipment.notes)}</p>
                </div>
            ` : ''}
        </div>

        <div class="details-section">
            <h4>Summary</h4>
            <div class="totals-grid">
                <div class="total-item">
                    <div class="total-label">Total Boxes</div>
                    <div class="total-value">${summary.total_boxes}</div>
                </div>
                <div class="total-item">
                    <div class="total-label">Total Pairs</div>
                    <div class="total-value">${summary.total_pairs}</div>
                </div>
                <div class="total-item">
                    <div class="total-label">Cartons</div>
                    <div class="total-value">${summary.unique_cartons}</div>
                </div>
                <div class="total-item">
                    <div class="total-label">Products</div>
                    <div class="total-value">${summary.unique_products}</div>
                </div>
            </div>
        </div>

        <div class="details-section">
            <h4>Contents</h4>
            <div class="contents-table-wrapper">
                <table class="contents-table">
                    <thead>
                        <tr>
                            <th>Carton</th>
                            <th>Product</th>
                            <th>FNSKU</th>
                            <th>Boxes Sent</th>
                            <th>Pairs Sent</th>
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
        showError('Please provide a reason for recall');
        return;
    }

    if (!confirm('Are you absolutely sure you want to recall this shipment?')) {
        return;
    }

    try {
        const result = await recallShipment(shipmentToRecall, notes);

        if (result.success) {
            showSuccess(result.message);
            closeRecallModal();
            loadShipments();
        } else {
            showError(result.error || 'Failed to recall shipment');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    }
}

// ============================================================================
// FILTERS
// ============================================================================

function applyFilters() {
    currentFilters.status = document.getElementById('statusFilter').value;
    currentFilters.from_date = document.getElementById('fromDateFilter').value;
    currentFilters.to_date = document.getElementById('toDateFilter').value;

    syncStatusCardsWithFilter();
    loadShipments();
}

function clearFilters() {
    currentFilters = { status: '', from_date: '', to_date: '' };
    document.getElementById('statusFilter').value = '';
    document.getElementById('fromDateFilter').value = '';
    document.getElementById('toDateFilter').value = '';

    syncStatusCardsWithFilter();
    loadShipments();
}

function filterByStatus(status) {
    document.getElementById('statusFilter').value = status;
    currentFilters.status = status;
    loadShipments();

    syncStatusCardsWithFilter();
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
    alert('Erfolg: ' + message);
}

function showError(message) {
    alert('Fehler: ' + message);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
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
