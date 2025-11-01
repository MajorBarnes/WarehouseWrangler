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
const selectedCartonIds = new Set();
let moveContext = { type: 'single', cartons: [] };
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
    const notAvailable = translate('common.placeholders.notAvailable', null, 'N/A');
    if (!dateString) return notAvailable;

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return notAvailable;

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
    const fallback = {
        received: 'Received',
        sent_to_amazon: 'Sent to Amazon',
        recalled: 'Recalled',
        adjusted: 'Adjusted',
        damaged: 'Damaged',
        sold: 'Sold'
    };

    return translate(`cartons.history.types.${type}`, null, fallback[type] || type);
}

function formatLocationLabel(location) {
    const map = {
        Incoming: 'cartons.filters.location.incoming',
        WML: 'cartons.filters.location.wml',
        GMR: 'cartons.filters.location.gmr'
    };

    const key = map[location];
    if (!key) {
        return location;
    }

    return translate(key, null, location);
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
    const text = translate('cartons.notifications.success', { message }, 'Success: {message}');
    window.alert(text);
}

function showError(message) {
    const text = translate('cartons.notifications.error', { message }, 'Error: {message}');
    window.alert(text);
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
        if (!userDisplay.dataset.userDisplayHydrated) {
            userDisplay.textContent = translate('common.user.anonymous', null, 'User');
        }

        if (user?.username) {
            userDisplay.textContent = user.username;
            userDisplay.removeAttribute('data-i18n');
            userDisplay.removeAttribute('data-i18n-attr');
            userDisplay.removeAttribute('data-i18n-args');
            userDisplay.dataset.userDisplayHydrated = 'true';
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

    document.getElementById('cartonsTableBody')?.addEventListener('change', handleRowSelectionChange);
    document.getElementById('selectAllCartons')?.addEventListener('change', handleSelectAllChange);
    document.getElementById('bulkMoveBtn')?.addEventListener('click', openBulkMoveModal);
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
        case 'open-bulk-move':
            openBulkMoveModal();
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
            const errorMessage = translate('cartons.errors.loadFailed', { error: data.error }, 'Failed to load cartons: {error}');
            showError(errorMessage);
            renderCartonsTable([]);
        }
    } catch (error) {
        console.error('Load cartons error:', error);
        const message = translate('common.errors.connection', null, 'Connection error. Please try again.');
        showError(message);
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
        const loadingText = translate('cartons.details.loading', null, 'Loading details...');
        body.innerHTML = `<div class="loading-indicator">${escapeHtml(loadingText)}</div>`;
    }

    try {
        const response = await fetch(`${API_BASE}/cartons/get_carton_details.php?carton_id=${cartonId}`, {
            headers: { 'Authorization': `Bearer ${getToken() || ''}` }
        });
        const data = await response.json();

        if (data.success) {
            showCartonDetailsModal(data);
        } else {
            const errorMessage = translate('cartons.errors.detailsFailed', { error: data.error }, 'Failed to load carton details: {error}');
            showError(errorMessage);
        }
    } catch (error) {
        console.error('Load carton details error:', error);
        const message = translate('common.errors.connection', null, 'Connection error. Please try again.');
        showError(message);
    }
}

async function moveCartonsRequest(cartonIds, newLocation, notes) {
    const payload = {
        carton_ids: Array.isArray(cartonIds) ? cartonIds : [],
        location: newLocation,
        notes: notes || ''
    };

    const response = await fetch(`${API_BASE}/cartons/move_carton.php`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken() || ''}`
        },
        body: JSON.stringify(payload)
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

    currentCartons = Array.isArray(cartons) ? cartons : [];
    cartonMetadataCache.clear();
    if (!Array.isArray(cartons) || cartons.length === 0) {
        tbody.innerHTML = '';
        currentCartons = [];
        selectedCartonIds.clear();
        setTableState({ isLoading: false, isEmpty: true });
        hideCartonTooltip();
        updateBulkSelectionUI();
        syncSelectAllState();
        return;
    }

    const availableIds = new Set(cartons.map((carton) => Number(carton.carton_id)));
    Array.from(selectedCartonIds).forEach((id) => {
        if (!availableIds.has(id)) {
            selectedCartonIds.delete(id);
        }
    });

    const rows = cartons.map((carton) => {
        const statusSlug = toStatusSlug(carton.status || '');
        const locationIcon = getLocationIconName(carton.location);
        const referenceMarkup = carton.carton_reference
            ? `<code>${escapeHtml(carton.carton_reference)}</code>`
            : '';

        const metadata = Array.isArray(carton.product_metadata) ? carton.product_metadata : [];
        cartonMetadataCache.set(Number(carton.carton_id), metadata);
        const isSelected = selectedCartonIds.has(Number(carton.carton_id));

        const locationLabel = formatLocationLabel(carton.location);
        const selectAria = translate('cartons.table.selectCartonAria', { number: carton.carton_number }, 'Select carton {number}');
        const viewLabel = translate('cartons.table.rowActions.view', null, 'View details');
        const moveLabel = translate('cartons.table.rowActions.move', null, 'Move carton');
        const archivedLabel = translate('cartons.table.rowActions.archived', null, 'Carton archived');

        const selectAriaEscaped = escapeHtml(selectAria);
        const viewLabelEscaped = escapeHtml(viewLabel);
        const moveLabelEscaped = escapeHtml(moveLabel);
        const archivedLabelEscaped = escapeHtml(archivedLabel);

        return `
            <tr data-carton-id="${carton.carton_id}" data-has-products="${metadata.length > 0}" tabindex="0">
                <td class="select-col">
                    <input type="checkbox" class="row-select" data-carton-id="${carton.carton_id}" aria-label="${selectAriaEscaped}" ${isSelected ? 'checked' : ''}>
                </td>
                <td>
                    <div class="carton-identifier">
                        <strong>${escapeHtml(carton.carton_number)}</strong>
                        ${referenceMarkup}
                    </div>
                </td>
                <td>
                    <span class="badge location-badge">
                        <span class="material-icons-outlined" aria-hidden="true">${locationIcon}</span>
                        <span>${escapeHtml(locationLabel)}</span>
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
                            aria-label="${viewLabelEscaped}"
                            title="${viewLabelEscaped}"
                            data-tooltip="${viewLabelEscaped}">
                            <span class="material-icons-outlined" aria-hidden="true">visibility</span>
                        </button>
                        ${statusSlug !== 'archived' ? `
                            <button class="icon-button" type="button"
                                data-action="open-move-modal"
                                data-carton-id="${carton.carton_id}"
                                data-carton-number="${escapeHtml(carton.carton_number)}"
                                data-carton-location="${escapeHtml(carton.location)}"
                                aria-label="${moveLabelEscaped}"
                                title="${moveLabelEscaped}"
                                data-tooltip="${moveLabelEscaped}">
                                <span class="material-icons-outlined" aria-hidden="true">swap_horiz</span>
                            </button>
                        ` : `
                            <button class="icon-button" type="button" disabled
                                aria-label="${archivedLabelEscaped}"
                                title="${archivedLabelEscaped}">
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
    syncSelectAllState();
    updateBulkSelectionUI();
    setTableState({ isLoading: false, isEmpty: false });
}

function handleRowSelectionChange(event) {
    const checkbox = event.target;
    if (!checkbox || !checkbox.classList.contains('row-select')) {
        return;
    }

    const cartonId = Number(checkbox.dataset.cartonId);
    if (!cartonId) {
        return;
    }

    if (checkbox.checked) {
        selectedCartonIds.add(cartonId);
    } else {
        selectedCartonIds.delete(cartonId);
    }

    syncSelectAllState();
    updateBulkSelectionUI();
}

function handleSelectAllChange(event) {
    const selectAll = event.target;
    if (!selectAll || selectAll.id !== 'selectAllCartons') {
        return;
    }

    const shouldSelectAll = Boolean(selectAll.checked);
    const checkboxes = document.querySelectorAll('#cartonsTableBody input.row-select');

    checkboxes.forEach((checkbox) => {
        const cartonId = Number(checkbox.dataset.cartonId);
        if (!cartonId) {
            return;
        }

        checkbox.checked = shouldSelectAll;
        if (shouldSelectAll) {
            selectedCartonIds.add(cartonId);
        } else {
            selectedCartonIds.delete(cartonId);
        }
    });

    syncSelectAllState();
    updateBulkSelectionUI();
}

function syncSelectAllState() {
    const selectAll = document.getElementById('selectAllCartons');
    if (!selectAll) {
        return;
    }

    const checkboxes = Array.from(document.querySelectorAll('#cartonsTableBody input.row-select'));
    if (checkboxes.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
    }

    const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    selectAll.checked = checkedCount === checkboxes.length && checkedCount > 0;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

function updateBulkSelectionUI() {
    const bulkBar = document.getElementById('cartonBulkActions');
    const summary = document.getElementById('bulkSelectionCount');
    const moveBtn = document.getElementById('bulkMoveBtn');

    const count = selectedCartonIds.size;
    const hasSelection = count > 0;

    if (summary) {
        let summaryText;
        if (!hasSelection) {
            summaryText = translate('cartons.bulk.summary.noneSelected', null, 'No cartons selected');
        } else if (count === 1) {
            summaryText = translate('cartons.bulk.summary.countSingle', { count }, '{count} carton selected');
        } else {
            summaryText = translate('cartons.bulk.summary.countPlural', { count }, '{count} cartons selected');
        }
        summary.textContent = summaryText;
    }

    if (moveBtn) {
        moveBtn.disabled = !hasSelection;
    }

    if (bulkBar) {
        bulkBar.classList.toggle('is-disabled', !hasSelection);
    }
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

    const unnamedProduct = translate('cartons.tooltip.unnamedProduct', null, 'Unnamed product');
    const artikelLabel = translate('cartons.tooltip.artikel', null, 'Article');
    const fnskuLabel = translate('cartons.tooltip.fnsku', null, 'FNSKU');
    const headerLabel = translate('cartons.tooltip.header', { count: metadata.length }, 'Products ({count})');

    const itemsHtml = metadata.map((item) => {
        const artikel = escapeHtml(item.artikel ?? '');
        const productGroup = escapeHtml(item.product_group ?? '');
        const fnsku = escapeHtml(item.fnsku ?? '');

        const productName = productGroup || escapeHtml(unnamedProduct);
        const artikelValue = artikel || '—';
        const fnskuValue = fnsku || '—';

        return `
            <li class="carton-tooltip__item">
                <span class="carton-tooltip__product">${productName}</span>
                <span class="carton-tooltip__meta">${escapeHtml(artikelLabel)}: ${artikelValue}</span>
                <span class="carton-tooltip__meta">${escapeHtml(fnskuLabel)}: ${fnskuValue}</span>
            </li>
        `;
    }).join('');

    cartonTooltipElement.innerHTML = `
        <div class="carton-tooltip__header">${escapeHtml(headerLabel)}</div>
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

    const basicTitle = translate('cartons.details.sections.basic.title', null, 'Basic information');
    const basicCartonLabel = translate('cartons.details.sections.basic.labels.carton', null, 'Carton');
    const basicLocationLabel = translate('cartons.details.sections.basic.labels.location', null, 'Location');
    const basicStatusLabel = translate('cartons.details.sections.basic.labels.status', null, 'Status');
    const basicCreatedLabel = translate('cartons.details.sections.basic.labels.created', null, 'Created');
    const basicUpdatedLabel = translate('cartons.details.sections.basic.labels.updated', null, 'Updated');

    const inventoryTitle = translate('cartons.details.sections.inventory.title', null, 'Inventory overview');
    const inventoryProducts = translate('cartons.details.sections.inventory.labels.products', null, 'Products');
    const inventoryBoxesCurrent = translate('cartons.details.sections.inventory.labels.boxesCurrent', null, 'Boxes (current)');
    const inventoryBoxesInitial = translate('cartons.details.sections.inventory.labels.boxesInitial', null, 'Boxes (initial)');
    const inventoryPairsCurrent = translate('cartons.details.sections.inventory.labels.pairsCurrent', null, 'Pairs (current)');
    const inventorySentToAmazon = translate('cartons.details.sections.inventory.labels.sentToAmazon', null, 'Sent to Amazon');

    const contentsTitle = translate('cartons.details.sections.contents.title', null, 'Products in carton');
    const contentsHeaders = {
        product: translate('cartons.details.sections.contents.headers.product', null, 'Product'),
        fnsku: translate('cartons.details.sections.contents.headers.fnsku', null, 'FNSKU'),
        boxesInitial: translate('cartons.details.sections.contents.headers.boxesInitial', null, 'Boxes (initial)'),
        boxesCurrent: translate('cartons.details.sections.contents.headers.boxesCurrent', null, 'Boxes (current)'),
        sentToAmazon: translate('cartons.details.sections.contents.headers.sentToAmazon', null, 'Sent to Amazon'),
        pairsPerBox: translate('cartons.details.sections.contents.headers.pairsPerBox', null, 'Pairs / box'),
        pairsCurrent: translate('cartons.details.sections.contents.headers.pairsCurrent', null, 'Pairs (current)')
    };

    const historyTitle = translate('cartons.details.sections.history.title', null, 'Movement history');
    const historyBoxChange = (entry) => {
        if (!entry.boxes) {
            return '';
        }
        const signed = entry.boxes > 0 ? `+${entry.boxes}` : String(entry.boxes);
        return translate('cartons.history.boxChange', { signed }, '{signed} boxes');
    };

    const historyByUser = (user) => translate('cartons.history.byUser', { user }, 'by {user}');
    const historyShipment = (reference) => translate('cartons.history.shipmentReference', { reference }, 'Shipment {reference}');

    const locationBadge = `
        <span class="badge location-badge">
            <span class="material-icons-outlined" aria-hidden="true">${getLocationIconName(carton.location)}</span>
            <span>${escapeHtml(formatLocationLabel(carton.location))}</span>
        </span>
    `;

    const statusBadge = `
        <span class="badge status-badge" data-status="${toStatusSlug(carton.status)}">
            ${escapeHtml(formatStatusLabel(carton.status))}
        </span>
    `;

    const contentsRows = contents.map((item) => `
        <tr>
            <td>${escapeHtml(item.product_name)}</td>
            <td><code>${escapeHtml(item.fnsku)}</code></td>
            <td class="numeric">${item.boxes_initial ?? 0}</td>
            <td class="numeric"><strong>${item.boxes_current ?? 0}</strong></td>
            <td class="numeric">${item.boxes_sent_to_amazon ?? 0}</td>
            <td class="numeric">${item.pairs_per_box ?? 0}</td>
            <td class="numeric"><strong>${item.pairs_current ?? 0}</strong></td>
        </tr>
    `).join('');

    const historyHtml = history && history.length > 0
        ? `
            <section class="details-section">
                <h4>${escapeHtml(historyTitle)}</h4>
                <div class="history-list">
                    ${history.slice(0, 12).map((entry) => {
                        const mainParts = [escapeHtml(formatMovementType(entry.movement_type))];
                        const boxChange = historyBoxChange(entry);
                        if (boxChange) {
                            mainParts.push(escapeHtml(boxChange));
                        }
                        if (entry.product_name) {
                            mainParts.push(escapeHtml(entry.product_name));
                        }

                        const metaParts = [formatDateTime(entry.created_at)];
                        if (entry.created_by_user) {
                            metaParts.push(historyByUser(entry.created_by_user));
                        }
                        if (entry.shipment_reference) {
                            metaParts.push(historyShipment(entry.shipment_reference));
                        }

                        const notesHtml = entry.notes ? `<div class="history-notes">${escapeHtml(entry.notes)}</div>` : '';
                        const metaHtml = metaParts.map((part) => `<span>${escapeHtml(part)}</span>`).join(' ');

                        return `
                            <article class="history-item">
                                <span class="history-icon">
                                    <span class="material-icons-outlined" aria-hidden="true">${getMovementIconName(entry.movement_type)}</span>
                                </span>
                                <div class="history-content">
                                    <div class="history-main">${mainParts.join(' • ')}</div>
                                    <div class="history-meta">${metaHtml}</div>
                                    ${notesHtml}
                                </div>
                            </article>
                        `;
                    }).join('')}
                </div>
            </section>
        `
        : '';

    const detailsHtml = `
        <section class="details-section">
            <h4>${escapeHtml(basicTitle)}</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <label>${escapeHtml(basicCartonLabel)}</label>
                    <strong>${escapeHtml(carton.carton_number)}</strong>
                </div>
                <div class="detail-item">
                    <label>${escapeHtml(basicLocationLabel)}</label>
                    ${locationBadge}
                </div>
                <div class="detail-item">
                    <label>${escapeHtml(basicStatusLabel)}</label>
                    ${statusBadge}
                </div>
                <div class="detail-item">
                    <label>${escapeHtml(basicCreatedLabel)}</label>
                    <span>${escapeHtml(formatDateTime(carton.created_at))}</span>
                </div>
                <div class="detail-item">
                    <label>${escapeHtml(basicUpdatedLabel)}</label>
                    <span>${escapeHtml(formatDateTime(carton.updated_at))}</span>
                </div>
            </div>
        </section>

        <section class="details-section">
            <h4>${escapeHtml(inventoryTitle)}</h4>
            <div class="totals-grid">
                <div class="total-item">
                    <span class="total-label">${escapeHtml(inventoryProducts)}</span>
                    <span class="total-value">${totals.product_count ?? 0}</span>
                </div>
                <div class="total-item">
                    <span class="total-label">${escapeHtml(inventoryBoxesCurrent)}</span>
                    <span class="total-value">${totals.boxes_current ?? 0}</span>
                </div>
                <div class="total-item">
                    <span class="total-label">${escapeHtml(inventoryBoxesInitial)}</span>
                    <span class="total-value">${totals.boxes_initial ?? 0}</span>
                </div>
                <div class="total-item">
                    <span class="total-label">${escapeHtml(inventoryPairsCurrent)}</span>
                    <span class="total-value">${totals.pairs_current ?? 0}</span>
                </div>
                <div class="total-item">
                    <span class="total-label">${escapeHtml(inventorySentToAmazon)}</span>
                    <span class="total-value">${totals.boxes_sent_to_amazon ?? 0}</span>
                </div>
            </div>
        </section>

        <section class="details-section">
            <h4>${escapeHtml(contentsTitle)}</h4>
            <div class="contents-table-wrapper">
                <table class="contents-table">
                    <thead>
                        <tr>
                            <th>${escapeHtml(contentsHeaders.product)}</th>
                            <th>${escapeHtml(contentsHeaders.fnsku)}</th>
                            <th class="numeric">${escapeHtml(contentsHeaders.boxesInitial)}</th>
                            <th class="numeric">${escapeHtml(contentsHeaders.boxesCurrent)}</th>
                            <th class="numeric">${escapeHtml(contentsHeaders.sentToAmazon)}</th>
                            <th class="numeric">${escapeHtml(contentsHeaders.pairsPerBox)}</th>
                            <th class="numeric">${escapeHtml(contentsHeaders.pairsCurrent)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${contentsRows}
                    </tbody>
                </table>
            </div>
        </section>

        ${historyHtml}
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

    moveContext = {
        type: 'single',
        cartons: [{
            id: Number(cartonId),
            number: cartonNumber,
            location: currentLocation
        }]
    };

    const modal = document.getElementById('moveCartonModal');
    const numberEl = document.getElementById('moveCartonNumber');
    const currentLocationBadge = document.getElementById('currentLocationBadge');
    const singleInfo = document.getElementById('moveCartonSingleInfo');
    const bulkInfo = document.getElementById('moveCartonBulkInfo');
    const title = document.getElementById('moveCartonTitle');
    const subtitle = document.getElementById('moveCartonSubtitle');
    const confirmLabel = document.getElementById('moveConfirmLabel');

    prepareMoveModal();

    if (title) title.textContent = translate('cartons.move.title', null, 'Move carton');
    if (subtitle) subtitle.textContent = translate('cartons.move.subtitle', null, 'Choose a new location for this carton.');
    if (confirmLabel) confirmLabel.textContent = translate('cartons.move.confirm', null, 'Move carton');

    singleInfo?.classList.remove('is-hidden');
    bulkInfo?.classList.add('is-hidden');

    if (numberEl) numberEl.textContent = cartonNumber;
    if (currentLocationBadge) {
        const locationLabel = formatLocationLabel(currentLocation);
        currentLocationBadge.innerHTML = `
            <span class="badge location-badge">
                <span class="material-icons-outlined" aria-hidden="true">${getLocationIconName(currentLocation)}</span>
                <span>${escapeHtml(locationLabel)}</span>
            </span>
        `;
    }

    modal?.classList.remove('hidden');
}

function openBulkMoveModal() {
    if (selectedCartonIds.size === 0) {
        return;
    }

    const selectedCartons = currentCartons
        .filter((carton) => selectedCartonIds.has(Number(carton.carton_id)))
        .map((carton) => ({
            id: Number(carton.carton_id),
            number: carton.carton_number,
            location: carton.location
        }));

    if (selectedCartons.length === 0) {
        const message = translate('cartons.errors.selectionUnavailable', null, 'Selected cartons are no longer available.');
        showError(message);
        selectedCartonIds.clear();
        updateBulkSelectionUI();
        syncSelectAllState();
        return;
    }

    moveContext = { type: 'bulk', cartons: selectedCartons };

    const modal = document.getElementById('moveCartonModal');
    const numberEl = document.getElementById('moveCartonNumber');
    const currentLocationBadge = document.getElementById('currentLocationBadge');
    const singleInfo = document.getElementById('moveCartonSingleInfo');
    const bulkInfo = document.getElementById('moveCartonBulkInfo');
    const title = document.getElementById('moveCartonTitle');
    const subtitle = document.getElementById('moveCartonSubtitle');
    const confirmLabel = document.getElementById('moveConfirmLabel');
    const selectionCountEl = document.getElementById('moveCartonSelectionCount');

    prepareMoveModal();

    if (title) title.textContent = translate('cartons.move.bulkTitle', null, 'Move cartons');
    if (subtitle) subtitle.textContent = translate('cartons.move.bulkSubtitle', null, 'Choose a new location for the selected cartons.');
    if (confirmLabel) confirmLabel.textContent = translate('cartons.move.bulkConfirm', null, 'Move cartons');

    singleInfo?.classList.add('is-hidden');
    bulkInfo?.classList.remove('is-hidden');

    if (selectionCountEl) {
        selectionCountEl.textContent = String(selectedCartons.length);
    }
    if (numberEl) numberEl.textContent = '';
    if (currentLocationBadge) currentLocationBadge.innerHTML = '';

    modal?.classList.remove('hidden');
}

function prepareMoveModal() {
    const locationSelect = document.getElementById('newLocation');
    const notesInput = document.getElementById('moveNotes');

    if (locationSelect) locationSelect.value = '';
    if (notesInput) notesInput.value = '';
}

function closeMoveModal() {
    document.getElementById('moveCartonModal')?.classList.add('hidden');
    moveContext = { type: 'single', cartons: [] };
}

function closeDetailsModal() {
    document.getElementById('cartonDetailsModal')?.classList.add('hidden');
}

async function confirmMoveCarton() {
    if (!moveContext || moveContext.cartons.length === 0) {
        return;
    }

    const locationSelect = document.getElementById('newLocation');
    const notesInput = document.getElementById('moveNotes');

    const newLocation = locationSelect?.value || '';
    const notes = notesInput?.value || '';

    if (!newLocation) {
        const message = translate('cartons.errors.missingLocation', null, 'Please choose a new location.');
        showError(message);
        return;
    }

    if (moveContext.type === 'single' && moveContext.cartons[0].location === newLocation) {
        const locationLabel = formatLocationLabel(newLocation);
        const message = translate('cartons.errors.sameLocation', { location: locationLabel }, 'Carton is already in {location}.');
        showError(message);
        return;
    }

    const selectedIds = moveContext.cartons.map((carton) => carton.id);
    const selectionCount = selectedIds.length;

    const locationLabel = formatLocationLabel(newLocation);

    const confirmMessage = moveContext.type === 'single'
        ? translate('cartons.prompts.confirmSingleMove', { number: moveContext.cartons[0].number, location: locationLabel }, 'Move carton {number} to {location}?')
        : translate('cartons.prompts.confirmBulkMove', { count: selectionCount, location: locationLabel }, 'Move {count} cartons to {location}?');

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        const result = await moveCartonsRequest(selectedIds, newLocation, notes);

        if (result.success) {
            const summary = result.summary || {};
            const movedCount = typeof summary.moved !== 'undefined'
                ? Number(summary.moved)
                : selectionCount;
            const skippedCount = Array.isArray(summary.skipped)
                ? summary.skipped.length
                : Number(summary.skipped_count ?? 0);

            let message = result.message;
            if (!message) {
                if (movedCount === 0) {
                    message = translate('cartons.messages.movedNone', null, 'No cartons were moved.');
                } else if (movedCount === 1) {
                    message = translate('cartons.messages.movedOne', { location: locationLabel }, '1 carton was moved to {location}.');
                } else {
                    message = translate('cartons.messages.movedMany', { count: movedCount, location: locationLabel }, '{count} cartons were moved to {location}.');
                }
            }

            if (skippedCount > 0) {
                const skippedText = translate('cartons.messages.skippedCount', { count: skippedCount }, '({count} skipped)');
                message = `${message} ${skippedText}`;
            }

            showSuccess(message);
            closeMoveModal();
            selectedCartonIds.clear();
            updateBulkSelectionUI();
            syncSelectAllState();
            loadLocationsSummary();
            loadCartons();
        } else {
            const fallback = translate('cartons.errors.moveFailed', null, 'Unable to move cartons.');
            showError(result.error || fallback);
        }
    } catch (error) {
        console.error('Move carton error:', error);
        const message = translate('common.errors.connection', null, 'Connection error. Please try again.');
        showError(message);
    }
}

function viewCartonDetails(cartonId) {
    loadCartonDetails(cartonId);
}
