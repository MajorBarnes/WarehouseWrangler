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

    // Setup buttons
    document.getElementById('refreshBtn').addEventListener('click', () => loadShipments());
    document.getElementById('createShipmentBtn').addEventListener('click', openCreateShipmentModal);
    document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);

    // Setup form
    document.getElementById('createShipmentForm').addEventListener('submit', handleCreateShipment);

    // Set default shipment date to today
    document.getElementById('shipmentDate').valueAsDate = new Date();

    // Load initial data
    loadShipments();
});

// ============================================================================
// API CALLS - SHIPMENTS
// ============================================================================

async function loadShipments() {
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
            renderShipmentsTable(data.shipments);
            updateSummaryCards(data.summary);
        } else {
            showError('Failed to load shipments: ' + data.error);
        }
    } catch (error) {
        console.error('Load shipments error:', error);
        showError('Connection error. Please try again.');
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
    if (!confirm(`Delete prepared shipment "${shipmentReference}"?\n\nThis will remove the shipment and free up all reserved boxes.`)) {
        return;
    }

    try {
        const result = await deleteShipment(shipmentId);
        
        if (result.success) {
            showSuccess(result.message);
            loadShipments();
        } else {
            showError(result.error || 'Failed to delete shipment');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
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
    document.getElementById('totalShipments').textContent = summary.total_shipments || 0;
    document.getElementById('preparedShipments').textContent = summary.prepared_count || 0;
    document.getElementById('sentShipments').textContent = summary.sent_count || 0;
    document.getElementById('recalledShipments').textContent = summary.recalled_count || 0;
}

function renderShipmentsTable(shipments) {
    const tbody = document.getElementById('shipmentsTableBody');
    
    if (shipments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No shipments found</td></tr>';
        return;
    }

    tbody.innerHTML = shipments.map(shipment => {
        const statusClass = shipment.status;
        
        return `
            <tr data-shipment-id="${shipment.shipment_id}">
                <td><strong>${escapeHtml(shipment.shipment_reference)}</strong></td>
                <td>${formatDate(shipment.shipment_date)}</td>
                <td>
                    <span class="status-badge status-${statusClass}">
                        ${getStatusIcon(shipment.status)} ${shipment.status}
                    </span>
                </td>
                <td class="text-center">${shipment.carton_count || 0}</td>
                <td class="text-center">${shipment.product_count || 0}</td>
                <td class="text-center"><strong>${shipment.total_boxes || 0}</strong></td>
                <td>${escapeHtml(shipment.created_by_user || 'N/A')}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-primary btn-small" onclick="viewShipmentDetails(${shipment.shipment_id})" title="View Details">
                            👁️ View
                        </button>
                        ${shipment.status === 'prepared' ? `
                            <button class="btn-success btn-small" onclick="continueShipment(${shipment.shipment_id}, '${escapeHtml(shipment.shipment_reference)}')" title="Add boxes and send">
                                ➕ Continue
                            </button>
                            <button class="btn-danger btn-small" onclick="confirmDeleteShipment(${shipment.shipment_id}, '${escapeHtml(shipment.shipment_reference)}')" title="Delete this prepared shipment">
                                🗑️ Delete
                            </button>
                        ` : ''}
                        ${shipment.status === 'sent' ? `
                            <button class="btn-danger btn-small" onclick="openRecallModal(${shipment.shipment_id}, '${escapeHtml(shipment.shipment_reference)}')" title="Recall shipment">
                                ↩️ Recall
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
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
        container.innerHTML = '<div class="no-data">No cartons available in WML or GMR with stock</div>';
        return;
    }

    container.innerHTML = availableCartons.map(carton => `
        <div class="carton-card" data-carton-id="${carton.carton_id}">
            <div class="carton-header">
                <strong>${escapeHtml(carton.carton_number)}</strong>
                <span class="location-badge location-${carton.location.toLowerCase()}">
                    ${getLocationIcon(carton.location)} ${carton.location}
                </span>
            </div>
            <div class="carton-info">
                ${carton.product_count} product(s) • 
                ${carton.total_boxes_available_for_shipment} boxes available
                ${carton.total_boxes_reserved > 0 ? `<br><small style="color: orange;">⚠️ ${carton.total_boxes_reserved} reserved in other shipments</small>` : ''}
            </div>
            <button class="btn-primary btn-small" onclick="selectBoxesFromCarton(${carton.carton_id})">
                Select Boxes →
            </button>
        </div>
    `).join('');
}

async function selectBoxesFromCarton(cartonId) {
    const carton = availableCartons.find(c => c.carton_id === cartonId);
    if (!carton) {
        showError('Carton not found');
        return;
    }
    showBoxSelectionDialog(carton, carton.products);
}

function showBoxSelectionDialog(carton, contents) {
    const html = `
        <div class="box-selection-dialog">
            <h4>Select boxes from ${escapeHtml(carton.carton_number)}</h4>
            ${contents.map((item, index) => `
                <div class="product-selection">
                    <div class="product-info">
                        <strong>${escapeHtml(item.product_name)}</strong>
                        <div class="product-meta">
                            FNSKU: ${escapeHtml(item.fnsku)} • 
                            Current: ${item.boxes_current} boxes 
                            ${item.boxes_reserved > 0 ? `<br><span style="color: orange;">⚠️ ${item.boxes_reserved} reserved in other shipments</span>` : ''}
                            <br><strong style="color: green;">Available for this shipment: ${item.boxes_available_for_shipment} boxes</strong>
                        </div>
                    </div>
                    <div class="quantity-input">
                        <label>Boxes to send:</label>
                        <input type="number" 
                            id="boxes_${carton.carton_id}_${item.product_id}" 
                            min="0" 
                            max="${item.boxes_available_for_shipment}" 
                            value="0"
                            data-carton-id="${carton.carton_id}"
                            data-product-id="${item.product_id}"
                            data-carton-number="${carton.carton_number}"
                            data-product-name="${item.product_name}"
                            data-pairs-per-box="${item.pairs_per_box}"
                            data-max="${item.boxes_available_for_shipment}">
                    </div>
                </div>
            `).join('')}
            <div class="dialog-actions">
                <button class="btn-secondary" onclick="closeBoxSelectionDialog()">Cancel</button>
                <button class="btn-primary" onclick="confirmBoxSelection()">Add to Shipment</button>
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
        showError('Please select at least one box');
        return;
    }

    // IMMEDIATELY save to database
    try {
        const result = await addBoxesToShipment(activeShipment.shipment_id, newBoxes);
        
        if (result.success) {
            closeBoxSelectionDialog();
            showSuccess(`Added ${newBoxes.length} box selection(s) to shipment`);
            
            // Reload shipment details to get the saved content
            await reloadShipmentContents();
            
            // Reload available cartons to update reserved quantities
            await loadAvailableCartons();
        } else {
            showError(result.error || 'Failed to add boxes to shipment');
            if (result.warnings && result.warnings.length > 0) {
                alert('Warnings:\n' + result.warnings.join('\n'));
            }
        }
    } catch (error) {
        showError('Connection error. Please try again.');
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
        proceedBtn.textContent = `Review & Send (${totalBoxes} boxes) →`;
    } else {
        proceedBtn.disabled = true;
        proceedBtn.textContent = 'Review & Send →';
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
                <button class="btn-danger btn-small" onclick="removeBoxFromShipment(${box.shipment_content_id})">
                    ✕ Remove
                </button>
            </td>
        </tr>
    `).join('');
}

async function removeBoxFromShipment(shipmentContentId) {
    if (!confirm('Remove these boxes from shipment?')) {
        return;
    }

    try {
        const result = await removeBoxesFromShipment(activeShipment.shipment_id, shipmentContentId);
        
        if (result.success) {
            showSuccess('Boxes removed from shipment');
            
            // Reload shipment contents
            await reloadShipmentContents();
            
            // Reload available cartons to update reserved quantities
            await loadAvailableCartons();
        } else {
            showError(result.error || 'Failed to remove boxes');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    }
}

// ============================================================================
// SEND SHIPMENT FLOW
// ============================================================================

async function proceedToSend() {
    if (selectedBoxes.length === 0) {
        showError('Please select boxes before proceeding');
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
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Sending...';

    try {
        const result = await sendShipment(activeShipment.shipment_id);

        if (result.success) {
            showSuccess(result.message);
            
            // Close all modals
            document.getElementById('sendShipmentModal').classList.add('hidden');
            
            // Reset state
            activeShipment = null;
            selectedBoxes = [];
            
            // Reload shipments
            loadShipments();
            
        } else {
            showError(result.error || 'Failed to send shipment');
            confirmBtn.disabled = false;
            confirmBtn.textContent = '🚀 Send Shipment';
        }
    } catch (error) {
        showError('Connection error. Please try again.');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '🚀 Send Shipment';
    }
}

// ============================================================================
// CONTINUE SHIPMENT (for prepared shipments)
// ============================================================================

async function continueShipment(shipmentId, shipmentReference) {
    try {
        const details = await loadShipmentDetails(shipmentId);
        
        if (!details.success) {
            showError('Failed to load shipment details');
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
                    <span class="status-badge status-${shipment.status}">
                        ${getStatusIcon(shipment.status)} ${shipment.status}
                    </span>
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
    
    loadShipments();
}

function clearFilters() {
    currentFilters = { status: '', from_date: '', to_date: '' };
    document.getElementById('statusFilter').value = '';
    document.getElementById('fromDateFilter').value = '';
    document.getElementById('toDateFilter').value = '';
    
    loadShipments();
}

function filterByStatus(status) {
    document.getElementById('statusFilter').value = status;
    currentFilters.status = status;
    loadShipments();
    
    // Visual feedback
    document.querySelectorAll('.summary-card').forEach(card => {
        card.classList.remove('active');
    });
    document.querySelector(`[data-status="${status}"]`)?.classList.add('active');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showSuccess(message) {
    alert('✅ ' + message);
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

function getStatusIcon(status) {
    const icons = {
        'prepared': '📝',
        'sent': '✅',
        'recalled': '↩️'
    };
    return icons[status] || '📦';
}

function getLocationIcon(location) {
    const icons = {
        'Incoming': '📥',
        'WML': '🏭',
        'GMR': '🏪'
    };
    return icons[location] || '📦';
}
