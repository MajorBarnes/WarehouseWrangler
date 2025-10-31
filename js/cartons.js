/**
 * WarehouseWrangler - Carton Management JavaScript
 */

const API_BASE = './api';
let currentCartons = [];
let currentFilters = {
    location: '',
    status: '',
    search: ''
};
let selectedCarton = null;
const cartonMetadataCache = new Map();
let cartonTooltipElement = null;
let isCartonTooltipInitialized = false;

// ---------------------------------------
// Helpers
// ---------------------------------------
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getToken() {
    return localStorage.getItem('ww_auth_token');
}

function getCurrentUser() {
    const data = localStorage.getItem('ww_user_data');
    if (!data) return null;

    try {
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to parse user data', error);
        return null;
    }
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return date.toLocaleString('de-DE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatStatusLabel(status) {
    if (!status) return '';
    return status
        .split(' ')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
}

function toStatusSlug(status) {
    return String(status || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
}

function getLocationIconName(location) {
    const map = {
        Incoming: 'move_to_inbox',
        WML: 'factory',
        GMR: 'storefront'
    };
    return map[location] || 'inventory_2';
}

function getMovementIconName(type) {
    const map = {
        received: 'download',
        sent_to_amazon: 'local_shipping',
        recalled: 'undo',
        adjusted: 'settings',
        damaged: 'warning',
        sold: 'point_of_sale'
    };
    return map[type] || 'history';
}

function formatMovementType(type) {
    const map = {
        received: 'Received',
        sent_to_amazon: 'Sent to Amazon',
        recalled: 'Recalled',
        adjusted: 'Adjusted',
        damaged: 'Damaged',
        sold: 'Sold'
    };
    return map[type] || type;
}

function setTableState({ isLoading = false, isEmpty = false }) {
    const loading = document.getElementById('cartonsLoading');
    const table = document.getElementById('cartonsTable');
    const empty = document.getElementById('cartonsEmpty');

    if (loading) {
        loading.classList.toggle('is-hidden', !isLoading);
    }

    if (table) {
        table.classList.toggle('is-hidden', isLoading || isEmpty);
    }

    if (empty) {
        empty.classList.toggle('is-hidden', !isEmpty);
    }
}

function showSuccess(message) {
    window.alert(`Erfolg: ${message}`);
}

function showError(message) {
    window.alert(`Fehler: ${message}`);
}

// ---------------------------------------
// Initialization
// ---------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    initializeHeader();
    bindCartonControls();
    initializeCartonTooltip();

    loadLocationsSummary();
    loadCartons();

    document.addEventListener('click', handleGlobalActionClick);
});

function initializeHeader() {
    const userDisplay = document.getElementById('userDisplay');
    const user = getCurrentUser();

    if (userDisplay) {
        userDisplay.textContent = user?.username || 'Benutzer';
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

function initializeCartonTooltip() {
    if (isCartonTooltipInitialized) {
        return;
    }

    cartonTooltipElement = document.getElementById('cartonTooltip');
    const tbody = document.getElementById('cartonsTableBody');

    if (!cartonTooltipElement || !tbody) {
        return;
    }

    isCartonTooltipInitialized = true;
    cartonTooltipElement.setAttribute('aria-hidden', 'true');

    const scrollContainer = document.querySelector('.table-scroll__viewport');
    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', hideCartonTooltip, { passive: true });
    }

    window.addEventListener('scroll', hideCartonTooltip, { passive: true });
    window.addEventListener('resize', hideCartonTooltip, { passive: true });

    tbody.addEventListener('pointerover', handleCartonRowEnter);
    tbody.addEventListener('pointerout', handleCartonRowLeave);
    tbody.addEventListener('focusin', handleCartonRowFocus);
    tbody.addEventListener('focusout', handleCartonRowBlur);
}

function bindCartonControls() {
    document.getElementById('refreshBtn')?.addEventListener('click', () => loadCartons());
    document.getElementById('applyFiltersBtn')?.addEventListener('click', applyFilters);
    document.getElementById('clearFiltersBtn')?.addEventListener('click', clearFilters);

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyFilters();
            }
        });
    }
}

// ---------------------------------------
// Event Delegation
// ---------------------------------------

function handleGlobalActionClick(event) {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) {
        return;
    }

    const action = actionElement.dataset.action;

    switch (action) {
        case 'filter-location':
            filterByLocation(actionElement.dataset.location || '');
            break;
        case 'clear-search':
            clearSearch();
            break;
        case 'view-carton':
            viewCartonDetails(Number(actionElement.dataset.cartonId));
            break;
        case 'open-move-modal':
            openMoveModal(
                Number(actionElement.dataset.cartonId),
                actionElement.dataset.cartonNumber || '',
                actionElement.dataset.cartonLocation || ''
            );
            break;
        case 'close-move-modal':
            closeMoveModal();
            break;
        case 'confirm-move':
            confirmMoveCarton();
            break;
        case 'close-details-modal':
            closeDetailsModal();
            break;
        default:
            break;
    }
}

// ---------------------------------------
// API Calls
// ---------------------------------------

async function loadLocationsSummary() {
    try {
        const response = await fetch(`${API_BASE}/cartons/get_locations_summary.php`, {
            headers: { 'Authorization': `Bearer ${getToken() || ''}` }
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
    setTableState({ isLoading: true, isEmpty: false });

    try {
        const params = new URLSearchParams();
        if (currentFilters.location) params.append('location', currentFilters.location);
        if (currentFilters.status) params.append('status', currentFilters.status);
        if (currentFilters.search) params.append('search', currentFilters.search);

        const queryString = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`${API_BASE}/cartons/get_cartons.php${queryString}`, {
            headers: { 'Authorization': `Bearer ${getToken() || ''}` }
        });
        const data = await response.json();

        if (data.success) {
            currentCartons = data.cartons;
            renderCartonsTable(data.cartons);

            if (currentFilters.location || currentFilters.status || currentFilters.search) {
                // updateSummaryCards(data.summary);
                loadLocationsSummary();
            }
        } else {
            showError(`Failed to load cartons: ${data.error}`);
            renderCartonsTable([]);
        }
    } catch (error) {
        console.error('Load cartons error:', error);
        showError('Connection error. Please try again.');
        renderCartonsTable([]);
    } finally {
        setTableState({ isLoading: false, isEmpty: currentCartons.length === 0 });
    }
}

async function loadCartonDetails(cartonId) {
    if (!cartonId) return;

    const modal = document.getElementById('cartonDetailsModal');
    const body = document.getElementById('cartonDetailsBody');
    if (modal && body) {
        modal.classList.remove('hidden');
        body.innerHTML = '<div class="loading-indicator">Details werden geladen…</div>';
    }

    try {
        const response = await fetch(`${API_BASE}/cartons/get_carton_details.php?carton_id=${cartonId}`, {
            headers: { 'Authorization': `Bearer ${getToken() || ''}` }
        });
        const data = await response.json();

        if (data.success) {
            showCartonDetailsModal(data);
        } else {
            showError(`Failed to load carton details: ${data.error}`);
        }
    } catch (error) {
        console.error('Load carton details error:', error);
        showError('Connection error. Please try again.');
    }
}

async function moveCarton(cartonId, newLocation, notes) {
    const response = await fetch(`${API_BASE}/cartons/move_carton.php`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken() || ''}`
        },
        body: JSON.stringify({
            carton_id: cartonId,
            location: newLocation,
            notes: notes || ''
        })
    });

    return response.json();
}

// ---------------------------------------
// Rendering
// ---------------------------------------

function updateSummaryCards(summary, totals = null) {
  // small helper to read the first available key
  const pick = (obj, keys, def = 0) => {
    if (!obj) return def;
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return def;
  };

  // ---- TOTALS (top-left card) ----
  if (totals) {
    const totalCartonsEl = document.getElementById('totalCartons');
    const totalBoxesEl   = document.getElementById('totalBoxes');
    const totalPairsEl   = document.getElementById('totalPairs');

    const tc = Number(pick(totals, ['total_cartons','cartons_total','carton_count','count_cartons'], 0));
    const tb = Number(pick(totals, ['total_boxes_current','total_boxes','boxes_total','count_boxes'], 0));
    const tp = Number(pick(totals, ['total_pairs_current','total_pairs','pairs_total'], 0));

    if (totalCartonsEl) totalCartonsEl.textContent = tc;
    if (totalBoxesEl)   totalBoxesEl.textContent   = tb;
    if (totalPairsEl)   totalPairsEl.textContent   = tp;
  }

  // ---- PER-LOCATION (Incoming / WML / GMR) ----
  if (!summary) return;

  const loc = (key) => summary[key] || summary[key?.toUpperCase?.()] || summary[key?.toLowerCase?.()] || {};

  const incoming = loc('Incoming');
  const wml      = loc('WML');
  const gmr      = loc('GMR');

  const cartonsKeys = ['in_stock_cartons','cartons','carton_count','total_cartons'];
  const boxesKeys   = ['total_boxes_current','boxes','box_count','total_boxes'];

  const incomingCartonsEl = document.getElementById('incomingCartons');
  const incomingBoxesEl   = document.getElementById('incomingBoxes');
  const wmlCartonsEl      = document.getElementById('wmlCartons');
  const wmlBoxesEl        = document.getElementById('wmlBoxes');
  const gmrCartonsEl      = document.getElementById('gmrCartons');
  const gmrBoxesEl        = document.getElementById('gmrBoxes');

  if (incomingCartonsEl) incomingCartonsEl.textContent = Number(pick(incoming, cartonsKeys, 0));
  if (incomingBoxesEl)   incomingBoxesEl.textContent   = Number(pick(incoming, boxesKeys, 0));
  if (wmlCartonsEl)      wmlCartonsEl.textContent      = Number(pick(wml, cartonsKeys, 0));
  if (wmlBoxesEl)        wmlBoxesEl.textContent        = Number(pick(wml, boxesKeys, 0));
  if (gmrCartonsEl)      gmrCartonsEl.textContent      = Number(pick(gmr, cartonsKeys, 0));
  if (gmrBoxesEl)        gmrBoxesEl.textContent        = Number(pick(gmr, boxesKeys, 0));
}

function renderCartonsTable(cartons) {
    const tbody = document.getElementById('cartonsTableBody');
    if (!tbody) return;

    cartonMetadataCache.clear();
    if (!Array.isArray(cartons) || cartons.length === 0) {
        tbody.innerHTML = '';
        currentCartons = [];
        setTableState({ isLoading: false, isEmpty: true });
        hideCartonTooltip();
        return;
    }

    const rows = cartons.map((carton) => {
        const statusSlug = toStatusSlug(carton.status || '');
        const locationIcon = getLocationIconName(carton.location);
        const referenceMarkup = carton.carton_reference
            ? `<code>${escapeHtml(carton.carton_reference)}</code>`
            : '';

        const metadata = Array.isArray(carton.product_metadata) ? carton.product_metadata : [];
        cartonMetadataCache.set(Number(carton.carton_id), metadata);

        return `
            <tr data-carton-id="${carton.carton_id}" data-has-products="${metadata.length > 0}" tabindex="0">
                <td>
                    <div class="carton-identifier">
                        <strong>${escapeHtml(carton.carton_number)}</strong>
                        ${referenceMarkup}
                    </div>
                </td>
                <td>
                    <span class="badge location-badge">
                        <span class="material-icons-outlined" aria-hidden="true">${locationIcon}</span>
                        <span>${escapeHtml(carton.location)}</span>
                    </span>
                </td>
                <td>
                    <span class="badge status-badge" data-status="${statusSlug}">
                        ${escapeHtml(formatStatusLabel(carton.status))}
                    </span>
                </td>
                <td class="numeric">${carton.product_count ?? 0}</td>
                <td class="numeric"><strong>${carton.total_boxes_current ?? 0}</strong></td>
                <td class="numeric">${carton.total_boxes_initial ?? 0}</td>
                <td class="numeric">${carton.total_boxes_sent ?? 0}</td>
                <td>${escapeHtml(formatDateTime(carton.updated_at))}</td>
                <td>
                    <div class="action-buttons">
                        <button class="icon-button" type="button"
                            data-action="view-carton"
                            data-carton-id="${carton.carton_id}"
                            aria-label="Details anzeigen"
                            title="Details anzeigen"
                            data-tooltip="Details anzeigen">
                            <span class="material-icons-outlined" aria-hidden="true">visibility</span>
                        </button>
                        ${statusSlug !== 'archived' ? `
                            <button class="icon-button" type="button"
                                data-action="open-move-modal"
                                data-carton-id="${carton.carton_id}"
                                data-carton-number="${escapeHtml(carton.carton_number)}"
                                data-carton-location="${escapeHtml(carton.location)}"
                                aria-label="Carton verschieben"
                                title="Carton verschieben"
                                data-tooltip="Carton verschieben">
                                <span class="material-icons-outlined" aria-hidden="true">swap_horiz</span>
                            </button>
                        ` : `
                            <button class="icon-button" type="button" disabled
                                aria-label="Carton archiviert"
                                title="Carton archiviert">
                                <span class="material-icons-outlined" aria-hidden="true">inventory</span>
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rows;
    hideCartonTooltip();
    setTableState({ isLoading: false, isEmpty: false });
}

function handleCartonRowEnter(event) {
    const row = event.target.closest('tr[data-carton-id]');
    if (!row) {
        return;
    }
    showCartonTooltip(row);
}

function handleCartonRowLeave(event) {
    const row = event.target.closest('tr[data-carton-id]');
    if (!row) {
        return;
    }

    const related = event.relatedTarget;
    if (related && row.contains(related)) {
        return;
    }

    hideCartonTooltip();
}

function handleCartonRowFocus(event) {
    const row = event.target.closest('tr[data-carton-id]');
    if (!row) {
        return;
    }
    showCartonTooltip(row);
}

function handleCartonRowBlur(event) {
    const row = event.target.closest('tr[data-carton-id]');
    if (!row) {
        return;
    }

    const nextTarget = event.relatedTarget;
    if (nextTarget && row.contains(nextTarget)) {
        return;
    }

    hideCartonTooltip();
}

function showCartonTooltip(row) {
    if (!cartonTooltipElement) {
        return;
    }

    const cartonId = Number(row.dataset.cartonId);
    const metadata = cartonMetadataCache.get(cartonId) || [];

    if (!metadata.length) {
        hideCartonTooltip();
        return;
    }

    const itemsHtml = metadata.map((item) => {
        const artikel = escapeHtml(item.artikel ?? '');
        const productGroup = escapeHtml(item.product_group ?? '');
        const fnsku = escapeHtml(item.fnsku ?? '');

        return `
            <li class="carton-tooltip__item">
                <span class="carton-tooltip__product">${productGroup || 'Produkt ohne Namen'}</span>
                <span class="carton-tooltip__meta">Artikel: ${artikel || '—'}</span>
                <span class="carton-tooltip__meta">FNSKU: ${fnsku || '—'}</span>
            </li>
        `;
    }).join('');

    cartonTooltipElement.innerHTML = `
        <div class="carton-tooltip__header">Produkte (${metadata.length})</div>
        <ul class="carton-tooltip__list">${itemsHtml}</ul>
    `;

    cartonTooltipElement.classList.add('is-visible');
    cartonTooltipElement.setAttribute('aria-hidden', 'false');
    cartonTooltipElement.style.top = '-9999px';
    cartonTooltipElement.style.left = '-9999px';

    const rowRect = row.getBoundingClientRect();
    const tooltipRect = cartonTooltipElement.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const padding = 16;
    const offset = 12;

    let top = rowRect.top - tooltipRect.height - offset;
    if (top < padding) {
        top = rowRect.bottom + offset;
    }

    let left = rowRect.left + (rowRect.width / 2) - (tooltipRect.width / 2);
    if (left < padding) {
        left = padding;
    }
    if (left + tooltipRect.width > viewportWidth - padding) {
        left = Math.max(padding, viewportWidth - tooltipRect.width - padding);
    }

    cartonTooltipElement.style.top = `${top}px`;
    cartonTooltipElement.style.left = `${left}px`;
}

function hideCartonTooltip() {
    if (!cartonTooltipElement) {
        return;
    }

    cartonTooltipElement.classList.remove('is-visible');
    cartonTooltipElement.setAttribute('aria-hidden', 'true');
    cartonTooltipElement.style.top = '';
    cartonTooltipElement.style.left = '';
}

function showCartonDetailsModal(data) {
    const modal = document.getElementById('cartonDetailsModal');
    const body = document.getElementById('cartonDetailsBody');
    if (!modal || !body) return;

    const { carton, contents = [], totals = {}, history = [] } = data;

    const detailsHtml = `
        <section class="details-section">
            <h4>Basisinformationen</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <label>Carton</label>
                    <strong>${escapeHtml(carton.carton_number)}</strong>
                </div>
                <div class="detail-item">
                    <label>Standort</label>
                    <span class="badge location-badge">
                        <span class="material-icons-outlined" aria-hidden="true">${getLocationIconName(carton.location)}</span>
                        <span>${escapeHtml(carton.location)}</span>
                    </span>
                </div>
                <div class="detail-item">
                    <label>Status</label>
                    <span class="badge status-badge" data-status="${toStatusSlug(carton.status)}">
                        ${escapeHtml(formatStatusLabel(carton.status))}
                    </span>
                </div>
                <div class="detail-item">
                    <label>Erstellt</label>
                    <span>${escapeHtml(formatDateTime(carton.created_at))}</span>
                </div>
                <div class="detail-item">
                    <label>Aktualisiert</label>
                    <span>${escapeHtml(formatDateTime(carton.updated_at))}</span>
                </div>
            </div>
        </section>

        <section class="details-section">
            <h4>Bestandsübersicht</h4>
            <div class="totals-grid">
                <div class="total-item">
                    <span class="total-label">Produkte</span>
                    <span class="total-value">${totals.product_count ?? 0}</span>
                </div>
                <div class="total-item">
                    <span class="total-label">Boxen aktuell</span>
                    <span class="total-value">${totals.boxes_current ?? 0}</span>
                </div>
                <div class="total-item">
                    <span class="total-label">Boxen initial</span>
                    <span class="total-value">${totals.boxes_initial ?? 0}</span>
                </div>
                <div class="total-item">
                    <span class="total-label">Paare aktuell</span>
                    <span class="total-value">${totals.pairs_current ?? 0}</span>
                </div>
                <div class="total-item">
                    <span class="total-label">An AMZ gesendet</span>
                    <span class="total-value">${totals.boxes_sent_to_amazon ?? 0}</span>
                </div>
            </div>
        </section>

        <section class="details-section">
            <h4>Produkte im Carton</h4>
            <div class="contents-table-wrapper">
                <table class="contents-table">
                    <thead>
                        <tr>
                            <th>Produkt</th>
                            <th>FNSKU</th>
                            <th class="numeric">Boxen initial</th>
                            <th class="numeric">Boxen aktuell</th>
                            <th class="numeric">An AMZ gesendet</th>
                            <th class="numeric">Paare / Box</th>
                            <th class="numeric">Paare aktuell</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${contents.map((item) => `
                            <tr>
                                <td>${escapeHtml(item.product_name)}</td>
                                <td><code>${escapeHtml(item.fnsku)}</code></td>
                                <td class="numeric">${item.boxes_initial ?? 0}</td>
                                <td class="numeric"><strong>${item.boxes_current ?? 0}</strong></td>
                                <td class="numeric">${item.boxes_sent_to_amazon ?? 0}</td>
                                <td class="numeric">${item.pairs_per_box ?? 0}</td>
                                <td class="numeric"><strong>${item.pairs_current ?? 0}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </section>

        ${history && history.length > 0 ? `
            <section class="details-section">
                <h4>Bewegungshistorie</h4>
                <div class="history-list">
                    ${history.slice(0, 12).map((entry) => `
                        <article class="history-item">
                            <span class="history-icon">
                                <span class="material-icons-outlined" aria-hidden="true">${getMovementIconName(entry.movement_type)}</span>
                            </span>
                            <div class="history-content">
                                <div class="history-main">
                                    ${escapeHtml(formatMovementType(entry.movement_type))}
                                    ${entry.boxes ? ` • ${entry.boxes > 0 ? '+' : ''}${entry.boxes} Boxen` : ''}
                                    ${entry.product_name ? ` • ${escapeHtml(entry.product_name)}` : ''}
                                </div>
                                <div class="history-meta">
                                    <span>${escapeHtml(formatDateTime(entry.created_at))}</span>
                                    ${entry.created_by_user ? `<span>von ${escapeHtml(entry.created_by_user)}</span>` : ''}
                                    ${entry.shipment_reference ? `<span>Shipment ${escapeHtml(entry.shipment_reference)}</span>` : ''}
                                </div>
                                ${entry.notes ? `<div class="history-notes">${escapeHtml(entry.notes)}</div>` : ''}
                            </div>
                        </article>
                    `).join('')}
                </div>
            </section>
        ` : ''}
    `;

    body.innerHTML = detailsHtml;
    modal.classList.remove('hidden');
}

// ---------------------------------------
// Filters
// ---------------------------------------

function applyFilters() {
    currentFilters.location = document.getElementById('locationFilter')?.value || '';
    currentFilters.status = document.getElementById('statusFilter')?.value || '';
    currentFilters.search = document.getElementById('searchInput')?.value.trim() || '';

    updateLocationButtons(currentFilters.location);
    loadCartons();
}

function clearFilters() {
    currentFilters = { location: '', status: '', search: '' };

    const locationFilter = document.getElementById('locationFilter');
    const statusFilter = document.getElementById('statusFilter');
    const searchInput = document.getElementById('searchInput');

    if (locationFilter) locationFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    if (searchInput) searchInput.value = '';

    resetLocationButtons();

    loadLocationsSummary();
    loadCartons();
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    currentFilters.search = '';
    loadCartons();
}

function filterByLocation(location) {
    const locationFilter = document.getElementById('locationFilter');
    if (locationFilter) {
        locationFilter.value = location;
    }

    currentFilters.location = location;
    updateLocationButtons(location);
    loadCartons();
}

function resetLocationButtons() {
    document.querySelectorAll('button[data-action="filter-location"]').forEach((button) => {
        button.classList.remove('is-active');
        button.setAttribute('aria-pressed', 'false');
    });
}

function updateLocationButtons(activeLocation) {
    document.querySelectorAll('button[data-action="filter-location"]').forEach((button) => {
        const isActive = button.dataset.location === activeLocation && activeLocation !== '';
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

// ---------------------------------------
// Modal Management
// ---------------------------------------

function openMoveModal(cartonId, cartonNumber, currentLocation) {
    if (!cartonId) return;

    selectedCarton = {
        id: cartonId,
        number: cartonNumber,
        location: currentLocation
    };

    const modal = document.getElementById('moveCartonModal');
    const numberEl = document.getElementById('moveCartonNumber');
    const currentLocationBadge = document.getElementById('currentLocationBadge');
    const locationSelect = document.getElementById('newLocation');
    const notesInput = document.getElementById('moveNotes');

    if (numberEl) numberEl.textContent = cartonNumber;
    if (currentLocationBadge) {
        currentLocationBadge.innerHTML = `
            <span class="badge location-badge">
                <span class="material-icons-outlined" aria-hidden="true">${getLocationIconName(currentLocation)}</span>
                <span>${escapeHtml(currentLocation)}</span>
            </span>
        `;
    }
    if (locationSelect) locationSelect.value = '';
    if (notesInput) notesInput.value = '';

    modal?.classList.remove('hidden');
}

function closeMoveModal() {
    document.getElementById('moveCartonModal')?.classList.add('hidden');
    selectedCarton = null;
}

function closeDetailsModal() {
    document.getElementById('cartonDetailsModal')?.classList.add('hidden');
}

async function confirmMoveCarton() {
    if (!selectedCarton) return;

    const locationSelect = document.getElementById('newLocation');
    const notesInput = document.getElementById('moveNotes');

    const newLocation = locationSelect?.value || '';
    const notes = notesInput?.value || '';

    if (!newLocation) {
        showError('Bitte wähle einen neuen Standort aus.');
        return;
    }

    if (newLocation === selectedCarton.location) {
        showError(`Carton befindet sich bereits in ${newLocation}.`);
        return;
    }

    if (!confirm(`Carton ${selectedCarton.number} nach ${newLocation} verschieben?`)) {
        return;
    }

    try {
        const result = await moveCarton(selectedCarton.id, newLocation, notes);

        if (result.success) {
            showSuccess(result.message || 'Carton erfolgreich bewegt.');
            closeMoveModal();
            loadLocationsSummary();
            loadCartons();
        } else {
            showError(result.error || 'Carton konnte nicht bewegt werden.');
        }
    } catch (error) {
        console.error('Move carton error:', error);
        showError('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
    }
}

function viewCartonDetails(cartonId) {
    loadCartonDetails(cartonId);
}
