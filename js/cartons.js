/**
 * WarehouseWrangler - Carton Management JavaScript
 */

// Configuration
const API_BASE = './api';
let currentCartons = [];
let currentFilters = {
    location: '',
    status: '',
    search: ''
};
let selectedCarton = null;

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

    // Setup filter buttons
    document.getElementById('refreshBtn').addEventListener('click', () => loadCartons());
    document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
    document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);

    // Setup search input (Enter key)
    document.getElementById('searchInput').addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });

    // Load initial data
    loadLocationsSummary();
    loadCartons();
});

// ============================================================================
// API CALLS
// ============================================================================

async function loadLocationsSummary() {
    try {
        const response = await fetch(`${API_BASE}/cartons/get_locations_summary.php`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (data.success) {
            updateSummaryCards(data.summary, data.totals);
        } else {
            console.error('Failed to load summary:', data.error);
        }
    } catch (error) {
        console.error('Load summary error:', error);
    }
}

async function loadCartons() {
    try {
        // Build query string
        const params = new URLSearchParams();
        if (currentFilters.location) params.append('location', currentFilters.location);
        if (currentFilters.status) params.append('status', currentFilters.status);
        if (currentFilters.search) params.append('search', currentFilters.search);

        const queryString = params.toString() ? '?' + params.toString() : '';
        const response = await fetch(`${API_BASE}/cartons/get_cartons.php${queryString}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (data.success) {
            currentCartons = data.cartons;
            renderCartonsTable(data.cartons);
            // Update summary cards with filtered data
            if (currentFilters.location || currentFilters.status || currentFilters.search) {
                updateSummaryCards(data.summary);
            }
        } else {
            showError('Failed to load cartons: ' + data.error);
        }
    } catch (error) {
        console.error('Load cartons error:', error);
        showError('Connection error. Please try again.');
    }
}

async function loadCartonDetails(cartonId) {
    try {
        const response = await fetch(`${API_BASE}/cartons/get_carton_details.php?carton_id=${cartonId}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (data.success) {
            showCartonDetailsModal(data);
        } else {
            showError('Failed to load carton details: ' + data.error);
        }
    } catch (error) {
        console.error('Load carton details error:', error);
        showError('Connection error. Please try again.');
    }
}

async function moveCarton(cartonId, newLocation, notes) {
    try {
        const response = await fetch(`${API_BASE}/cartons/move_carton.php`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                carton_id: cartonId,
                location: newLocation,
                notes: notes || ''
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Move carton error:', error);
        throw error;
    }
}

// ============================================================================
// UI RENDERING
// ============================================================================

function updateSummaryCards(summary, totals = null) {
    if (totals) {
        document.getElementById('totalCartons').textContent = totals.total_cartons;
        document.getElementById('totalBoxes').textContent = totals.total_boxes_current;
        document.getElementById('totalPairs').textContent = totals.total_pairs_current;
    }

    if (summary) {
        // Incoming
        document.getElementById('incomingCartons').textContent = summary.Incoming?.in_stock_cartons || 0;
        document.getElementById('incomingBoxes').textContent = summary.Incoming?.total_boxes_current || 0;

        // WML
        document.getElementById('wmlCartons').textContent = summary.WML?.in_stock_cartons || 0;
        document.getElementById('wmlBoxes').textContent = summary.WML?.total_boxes_current || 0;

        // GMR
        document.getElementById('gmrCartons').textContent = summary.GMR?.in_stock_cartons || 0;
        document.getElementById('gmrBoxes').textContent = summary.GMR?.total_boxes_current || 0;
    }
}

function renderCartonsTable(cartons) {
    const tbody = document.getElementById('cartonsTableBody');
    
    if (cartons.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">No cartons found</td></tr>';
        return;
    }

    tbody.innerHTML = cartons.map(carton => {
        const statusClass = carton.status.replace(' ', '-');
        const locationClass = carton.location.toLowerCase();
        
        return `
            <tr data-carton-id="${carton.carton_id}">
                <td>
                    <strong>${escapeHtml(carton.carton_number)}</strong>
                </td>
                <td>
                    <span class="location-badge location-${locationClass}">
                        ${getLocationIcon(carton.location)} ${carton.location}
                    </span>
                </td>
                <td>
                    <span class="status-badge status-${statusClass}">${carton.status}</span>
                </td>
                <td class="text-center">${carton.product_count || 0}</td>
                <td class="text-center">
                    <strong>${carton.total_boxes_current || 0}</strong>
                </td>
                <td class="text-center text-muted">${carton.total_boxes_initial || 0}</td>
                <td class="text-center text-muted">${carton.total_boxes_sent || 0}</td>
                <td class="text-muted">${formatDateTime(carton.updated_at)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-primary btn-small" onclick="viewCartonDetails(${carton.carton_id})" title="View Details">
                            👁️ View
                        </button>
                        ${carton.status !== 'archived' ? `
                            <button class="btn-secondary btn-small" onclick="openMoveModal(${carton.carton_id}, '${escapeHtml(carton.carton_number)}', '${carton.location}')" title="Move Carton">
                                🔄 Move
                            </button>
                        ` : `
                            <button class="btn-secondary btn-small" disabled title="Cannot move archived carton">
                                🔒 Archived
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function showCartonDetailsModal(data) {
    const modal = document.getElementById('cartonDetailsModal');
    const body = document.getElementById('cartonDetailsBody');
    
    const carton = data.carton;
    const contents = data.contents;
    const totals = data.totals;
    const history = data.history;
    
    body.innerHTML = `
        <div class="details-section">
            <h4>Basic Information</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <label>Carton Number:</label>
                    <strong>${escapeHtml(carton.carton_number)}</strong>
                </div>
                <div class="detail-item">
                    <label>Location:</label>
                    <span class="location-badge location-${carton.location.toLowerCase()}">
                        ${getLocationIcon(carton.location)} ${carton.location}
                    </span>
                </div>
                <div class="detail-item">
                    <label>Status:</label>
                    <span class="status-badge status-${carton.status.replace(' ', '-')}">${carton.status}</span>
                </div>
                <div class="detail-item">
                    <label>Created:</label>
                    ${formatDateTime(carton.created_at)}
                </div>
                <div class="detail-item">
                    <label>Last Updated:</label>
                    ${formatDateTime(carton.updated_at)}
                </div>
            </div>
        </div>

        <div class="details-section">
            <h4>Contents Summary</h4>
            <div class="totals-grid">
                <div class="total-item">
                    <div class="total-label">Products</div>
                    <div class="total-value">${totals.product_count}</div>
                </div>
                <div class="total-item">
                    <div class="total-label">Boxes (Current)</div>
                    <div class="total-value">${totals.boxes_current}</div>
                </div>
                <div class="total-item">
                    <div class="total-label">Boxes (Initial)</div>
                    <div class="total-value">${totals.boxes_initial}</div>
                </div>
                <div class="total-item">
                    <div class="total-label">Pairs (Current)</div>
                    <div class="total-value">${totals.pairs_current}</div>
                </div>
                <div class="total-item">
                    <div class="total-label">Sent to AMZ</div>
                    <div class="total-value">${totals.boxes_sent_to_amazon}</div>
                </div>
            </div>
        </div>

        <div class="details-section">
            <h4>Products in This Carton</h4>
            <div class="contents-table-wrapper">
                <table class="contents-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>FNSKU</th>
                            <th>Boxes Initial</th>
                            <th>Boxes Current</th>
                            <th>Boxes Sent</th>
                            <th>Pairs/Box</th>
                            <th>Pairs Current</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${contents.map(item => `
                            <tr>
                                <td>${escapeHtml(item.product_name)}</td>
                                <td><code>${escapeHtml(item.fnsku)}</code></td>
                                <td class="text-center">${item.boxes_initial}</td>
                                <td class="text-center"><strong>${item.boxes_current}</strong></td>
                                <td class="text-center text-muted">${item.boxes_sent_to_amazon}</td>
                                <td class="text-center">${item.pairs_per_box}</td>
                                <td class="text-center"><strong>${item.pairs_current}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        ${history && history.length > 0 ? `
            <div class="details-section">
                <h4>Movement History</h4>
                <div class="history-list">
                    ${history.slice(0, 10).map(item => `
                        <div class="history-item">
                            <div class="history-icon">${getMovementIcon(item.movement_type)}</div>
                            <div class="history-content">
                                <div class="history-main">
                                    <strong>${formatMovementType(item.movement_type)}</strong>
                                    ${item.boxes > 0 ? `+${item.boxes}` : item.boxes} boxes
                                    - ${escapeHtml(item.product_name)}
                                </div>
                                <div class="history-meta">
                                    ${formatDateTime(item.created_at)}
                                    ${item.created_by_user ? `• by ${escapeHtml(item.created_by_user)}` : ''}
                                    ${item.shipment_reference ? `• ${escapeHtml(item.shipment_reference)}` : ''}
                                </div>
                                ${item.notes ? `<div class="history-notes">${escapeHtml(item.notes)}</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
    
    modal.classList.remove('hidden');
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

function openMoveModal(cartonId, cartonNumber, currentLocation) {
    selectedCarton = { id: cartonId, number: cartonNumber, location: currentLocation };
    
    document.getElementById('moveCartonNumber').textContent = cartonNumber;
    document.getElementById('currentLocationBadge').innerHTML = `
        <span class="location-badge location-${currentLocation.toLowerCase()}">
            ${getLocationIcon(currentLocation)} ${currentLocation}
        </span>
    `;
    
    // Reset form
    document.getElementById('newLocation').value = '';
    document.getElementById('moveNotes').value = '';
    
    // Show modal
    document.getElementById('moveCartonModal').classList.remove('hidden');
}

function closeMoveModal() {
    document.getElementById('moveCartonModal').classList.add('hidden');
    selectedCarton = null;
}

function closeDetailsModal() {
    document.getElementById('cartonDetailsModal').classList.add('hidden');
}

async function confirmMoveCarton() {
    const newLocation = document.getElementById('newLocation').value;
    const notes = document.getElementById('moveNotes').value;
    
    if (!newLocation) {
        showError('Please select a new location');
        return;
    }
    
    if (newLocation === selectedCarton.location) {
        showError(`Carton is already in ${newLocation}`);
        return;
    }
    
    if (!confirm(`Move carton ${selectedCarton.number} from ${selectedCarton.location} to ${newLocation}?`)) {
        return;
    }
    
    try {
        const result = await moveCarton(selectedCarton.id, newLocation, notes);
        
        if (result.success) {
            showSuccess(result.message);
            closeMoveModal();
            // Reload data
            loadLocationsSummary();
            loadCartons();
        } else {
            showError(result.error || 'Failed to move carton');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    }
}

function viewCartonDetails(cartonId) {
    loadCartonDetails(cartonId);
}

// ============================================================================
// FILTERS
// ============================================================================

function applyFilters() {
    currentFilters.location = document.getElementById('locationFilter').value;
    currentFilters.status = document.getElementById('statusFilter').value;
    currentFilters.search = document.getElementById('searchInput').value.trim();
    
    loadCartons();
}

function clearFilters() {
    currentFilters = { location: '', status: '', search: '' };
    document.getElementById('locationFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('searchInput').value = '';
    
    // Reload summary and cartons
    loadLocationsSummary();
    loadCartons();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentFilters.search = '';
    loadCartons();
}

function filterByLocation(location) {
    document.getElementById('locationFilter').value = location;
    currentFilters.location = location;
    loadCartons();
    
    // Visual feedback on summary cards
    document.querySelectorAll('.summary-card').forEach(card => {
        card.classList.remove('active');
    });
    document.querySelector(`[data-location="${location}"]`)?.classList.add('active');
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

function getLocationIcon(location) {
    const icons = {
        'Incoming': '📥',
        'WML': '🏭',
        'GMR': '🏪'
    };
    return icons[location] || '📦';
}

function getMovementIcon(type) {
    const icons = {
        'received': '📥',
        'sent_to_amazon': '📤',
        'recalled': '↩️',
        'adjusted': '⚙️',
        'damaged': '⚠️',
        'sold': '💰'
    };
    return icons[type] || '📝';
}

function formatMovementType(type) {
    const types = {
        'received': 'Received',
        'sent_to_amazon': 'Sent to Amazon',
        'recalled': 'Recalled',
        'adjusted': 'Adjusted',
        'damaged': 'Damaged',
        'sold': 'Sold'
    };
    return types[type] || type;
}
