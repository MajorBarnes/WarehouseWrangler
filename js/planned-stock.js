/**
 * WarehouseWrangler - Planned Stock Management
 */

const API_BASE = './api';
let plannedStockRows = [];
let productsIndex = new Map();
let modalMode = 'create';

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

function resetPlannedStockForm() {
    const form = document.getElementById('plannedStockForm');
    if (form) {
        form.reset();
    }

    const entryId = document.getElementById('plannedStockId');
    const entryScope = document.getElementById('entryScope');
    const entryBoxes = document.getElementById('entryBoxes');
    const entryEta = document.getElementById('entryEta');
    const entryLabel = document.getElementById('entryLabel');
    const entryIsActive = document.getElementById('entryIsActive');

    if (entryId) entryId.value = '';
    if (entryScope) entryScope.value = 'committed';
    if (entryBoxes) {
        entryBoxes.value = '';
        entryBoxes.min = '1';
    }
    if (entryEta) entryEta.value = '';
    if (entryLabel) entryLabel.value = '';
    if (entryIsActive) entryIsActive.checked = true;
}

const filterState = {
    productId: '',
    includeSimulations: false,
    includeFuture: false,
    includeInactive: false,
    searchTerm: ''
};

const numberFormatter = new Intl.NumberFormat('de-DE');
const pairsFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(value) {
    const placeholder = translate('common.placeholders.emDash', null, '—');
    if (!value) return placeholder;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return placeholder;
    }
    return date.toLocaleDateString('de-DE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showSuccess(message) {
    const alertMessage = translate('common.alerts.success', { message }, 'Success: {message}');
    window.alert(alertMessage);
}

function showError(message) {
    const alertMessage = translate('common.alerts.error', { message }, 'Error: {message}');
    window.alert(alertMessage);
}

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

function bindEventHandlers() {
    document.getElementById('filtersForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        applyFilters();
    });

    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
        resetFilters();
        loadPlannedStock();
    });

    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        loadPlannedStock();
    });

    document.getElementById('addEntryBtn')?.addEventListener('click', () => {
        openPlannedStockModal('create');
    });

    document.getElementById('searchInput')?.addEventListener('input', (event) => {
        filterState.searchTerm = event.target.value.trim().toLowerCase();
        renderPlannedStockTable();
    });

    document.getElementById('plannedStockModalClose')?.addEventListener('click', closePlannedStockModal);
    document.getElementById('modalCancelBtn')?.addEventListener('click', closePlannedStockModal);

    document.getElementById('plannedStockForm')?.addEventListener('submit', handlePlannedStockSubmit);

    document.getElementById('plannedStockTableBody')?.addEventListener('click', handleTableAction);

    document.getElementById('plannedStockModal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) {
            closePlannedStockModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const modal = document.getElementById('plannedStockModal');
            if (modal && !modal.classList.contains('hidden')) {
                event.preventDefault();
                closePlannedStockModal();
            }
        }
    });
}

function applyFilters() {
    const productFilter = document.getElementById('productFilter');
    const includeSimulations = document.getElementById('includeSimulations');
    const includeFuture = document.getElementById('includeFuture');
    const includeInactive = document.getElementById('includeInactive');

    filterState.productId = productFilter?.value || '';
    filterState.includeSimulations = includeSimulations?.checked ?? false;
    filterState.includeFuture = includeFuture?.checked ?? false;
    filterState.includeInactive = includeInactive?.checked ?? false;

    loadPlannedStock();
}

function resetFilters() {
    const productFilter = document.getElementById('productFilter');
    const includeSimulations = document.getElementById('includeSimulations');
    const includeFuture = document.getElementById('includeFuture');
    const includeInactive = document.getElementById('includeInactive');
    const searchInput = document.getElementById('searchInput');

    filterState.productId = '';
    filterState.includeSimulations = false;
    filterState.includeFuture = false;
    filterState.includeInactive = false;
    filterState.searchTerm = '';

    if (productFilter) productFilter.value = '';
    if (includeSimulations) includeSimulations.checked = false;
    if (includeFuture) includeFuture.checked = false;
    if (includeInactive) includeInactive.checked = false;
    if (searchInput) searchInput.value = '';

    renderPlannedStockTable();
}

async function loadProducts() {
    try {
        const response = await fetch(`${API_BASE}/products/get_all.php`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();
        if (!data.success) {
            showError(translate('plannedStock.errors.loadProducts', null, 'Failed to load products.'));
            return;
        }

        const productMap = new Map();
        const options = [];

        data.products.forEach((product) => {
            productMap.set(Number(product.product_id), {
                artikel: product.artikel,
                product_name: product.product_name,
                pairs_per_box: Number(product.pairs_per_box) || 0
            });
            const artikelValue = product.artikel
                ? product.artikel
                : translate('plannedStock.products.unknownArtikel', null, 'Unknown');
            const nameValue = product.product_name || '';
            const labelParts = [artikelValue];
            if (nameValue) {
                labelParts.push(nameValue);
            }
            options.push({
                id: Number(product.product_id),
                label: labelParts.join(' – ')
            });
        });

        productsIndex = productMap;
        populateProductSelects(options.sort((a, b) => a.label.localeCompare(b.label, 'de')));
    } catch (error) {
        console.error('Load products failed', error);
        showError(translate('plannedStock.errors.loadProducts', null, 'Failed to load products.'));
    }
}

function populateProductSelects(options) {
    const productFilter = document.getElementById('productFilter');
    const entryProduct = document.getElementById('entryProduct');

    if (productFilter) {
        const current = productFilter.value;
        const allLabel = translate('plannedStock.filters.product.all', null, 'All products');
        productFilter.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>` + options.map((option) => {
            return `<option value="${option.id}">${escapeHtml(option.label)}</option>`;
        }).join('');
        if (current) {
            productFilter.value = current;
        }
    }

    if (entryProduct) {
        const current = entryProduct.value;
        const placeholder = translate('plannedStock.modal.productPlaceholder', null, 'Select product');
        entryProduct.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + options.map((option) => {
            return `<option value="${option.id}">${escapeHtml(option.label)}</option>`;
        }).join('');
        if (current) {
            entryProduct.value = current;
        }
    }
}

function setTableState({ isLoading = false, isEmpty = false }) {
    const loading = document.getElementById('plannedStockLoading');
    const table = document.getElementById('plannedStockTable');
    const empty = document.getElementById('plannedStockEmpty');

    loading?.classList.toggle('is-hidden', !isLoading);
    table?.classList.toggle('is-hidden', isLoading || isEmpty);
    empty?.classList.toggle('is-hidden', !isEmpty);
}

async function loadPlannedStock() {
    setTableState({ isLoading: true, isEmpty: false });

    const params = new URLSearchParams();
    if (filterState.productId) {
        params.set('product_id', filterState.productId);
    }
    if (filterState.includeSimulations) {
        params.set('include_simulations', '1');
    }
    if (filterState.includeFuture) {
        params.set('include_future', '1');
    }
    if (filterState.includeInactive) {
        params.set('include_inactive', '1');
    }

    const url = `${API_BASE}/planned_stock/get_planned_stock.php${params.toString() ? `?${params}` : ''}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || translate('plannedStock.errors.unknown', null, 'Unknown error'));
        }

        plannedStockRows = Array.isArray(data.data) ? data.data : [];
        renderSummary();
        renderPlannedStockTable();
    } catch (error) {
        console.error('Load planned stock failed', error);
        showError(translate('plannedStock.errors.loadFailed', null, 'Failed to load planned stock.'));
        setTableState({ isLoading: false, isEmpty: true });
    }
}

function getFilteredRows() {
    if (!filterState.searchTerm) {
        return plannedStockRows.slice();
    }

    return plannedStockRows.filter((row) => {
        const product = productsIndex.get(Number(row.product_id));
        const haystack = [
            row.product_name,
            product?.artikel,
            product?.product_name,
            row.label,
            row.scope
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(filterState.searchTerm);
    });
}

function renderSummary() {
    let activeBoxes = 0;
    let activePairs = 0;
    let committedBoxes = 0;
    let committedPairs = 0;
    let simulationBoxes = 0;
    let simulationPairs = 0;

    plannedStockRows.forEach((row) => {
        const boxes = Number(row.quantity_boxes) || 0;
        const pairsPerBox = Number(row.pairs_per_box) || productsIndex.get(Number(row.product_id))?.pairs_per_box || 0;
        const pairs = boxes * pairsPerBox;
        const isActive = Number(row.is_active ?? 1) === 1;
        const scope = row.scope || 'committed';

        if (!isActive) {
            return;
        }

        activeBoxes += boxes;
        activePairs += pairs;

        if (scope === 'simulation') {
            simulationBoxes += boxes;
            simulationPairs += pairs;
        } else {
            committedBoxes += boxes;
            committedPairs += pairs;
        }
    });

    const activeBoxesEl = document.getElementById('activeBoxes');
    const activePairsEl = document.getElementById('activePairs');
    const committedBoxesEl = document.getElementById('committedBoxes');
    const committedPairsEl = document.getElementById('committedPairs');
    const simulationBoxesEl = document.getElementById('simulationBoxes');
    const simulationPairsEl = document.getElementById('simulationPairs');

    if (activeBoxesEl) activeBoxesEl.textContent = numberFormatter.format(activeBoxes);
    if (activePairsEl) activePairsEl.textContent = pairsFormatter.format(activePairs);
    if (committedBoxesEl) committedBoxesEl.textContent = numberFormatter.format(committedBoxes);
    if (committedPairsEl) committedPairsEl.textContent = pairsFormatter.format(committedPairs);
    if (simulationBoxesEl) simulationBoxesEl.textContent = numberFormatter.format(simulationBoxes);
    if (simulationPairsEl) simulationPairsEl.textContent = pairsFormatter.format(simulationPairs);
}

function renderPlannedStockTable() {
    const tbody = document.getElementById('plannedStockTableBody');
    if (!tbody) {
        return;
    }

    const rows = getFilteredRows();
    if (rows.length === 0) {
        tbody.innerHTML = '';
        setTableState({ isLoading: false, isEmpty: true });
        return;
    }

    const html = rows.map((row) => {
        const id = Number(row.id);
        const productInfo = productsIndex.get(Number(row.product_id));
        const productName = row.product_name
            || productInfo?.product_name
            || translate('plannedStock.table.labels.productUnknown', null, 'Unknown product');
        const artikel = productInfo?.artikel
            ? translate('plannedStock.table.labels.articleValue', { artikel: productInfo.artikel }, 'Article {artikel}')
            : translate('plannedStock.table.labels.articleUnknown', null, 'Article unknown');
        const scopeValue = (row.scope || 'committed').toLowerCase();
        const scopeLabel = scopeValue === 'simulation'
            ? translate('plannedStock.scope.simulation', null, 'Simulation')
            : translate('plannedStock.scope.committed', null, 'Committed');
        const boxes = Number(row.quantity_boxes) || 0;
        const pairsPerBox = Number(row.pairs_per_box) || productInfo?.pairs_per_box || 0;
        const pairs = boxes * pairsPerBox;
        const label = row.label ? escapeHtml(row.label) : escapeHtml(translate('common.placeholders.emDash', null, '—'));
        const isActive = Number(row.is_active ?? 1) === 1;
        const statusText = isActive
            ? translate('plannedStock.table.status.active', null, 'Active')
            : translate('plannedStock.table.status.inactive', null, 'Inactive');
        const editTitle = translate('plannedStock.table.actions.edit', null, 'Edit');
        const toggleTitle = isActive
            ? translate('plannedStock.table.actions.deactivate', null, 'Deactivate')
            : translate('plannedStock.table.actions.activate', null, 'Activate');
        const toggleAria = translate('plannedStock.table.actions.toggle', null, 'Toggle status');
        const deleteTitle = translate('plannedStock.table.actions.delete', null, 'Delete');

        return `
            <tr>
                <td>
                    <div class="product-cell">
                        <span class="product-name">${escapeHtml(productName)}</span>
                        <span class="product-meta">${escapeHtml(artikel)}</span>
                    </div>
                </td>
                <td>
                    <span class="scope-badge scope-${scopeValue}">${escapeHtml(scopeLabel)}</span>
                </td>
                <td>${label}</td>
                <td class="numeric">${numberFormatter.format(boxes)}</td>
                <td class="numeric">${pairsFormatter.format(pairs)}</td>
                <td>${formatDate(row.eta_date)}</td>
                <td>
                    <span class="status-badge ${isActive ? 'is-active' : 'is-inactive'}">${escapeHtml(statusText)}</span>
                </td>
                <td class="actions-col">
                    <div class="actions-toolbar">
                        <button type="button" class="action-button" data-action="edit" data-id="${id}" title="${escapeHtml(editTitle)}">
                            <span class="material-icons-outlined" aria-hidden="true">edit</span>
                            <span class="visually-hidden">${escapeHtml(editTitle)}</span>
                        </button>
                        <button type="button" class="action-button" data-action="toggle-active" data-id="${id}" title="${escapeHtml(toggleTitle)}">
                            <span class="material-icons-outlined" aria-hidden="true">${isActive ? 'toggle_off' : 'toggle_on'}</span>
                            <span class="visually-hidden">${escapeHtml(toggleAria)}</span>
                        </button>
                        <button type="button" class="action-button danger" data-action="delete" data-id="${id}" title="${escapeHtml(deleteTitle)}">
                            <span class="material-icons-outlined" aria-hidden="true">delete</span>
                            <span class="visually-hidden">${escapeHtml(deleteTitle)}</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html;
    setTableState({ isLoading: false, isEmpty: false });
}

function openPlannedStockModal(mode, entry = null) {
    modalMode = mode;
    const modal = document.getElementById('plannedStockModal');
    const modalTitle = document.getElementById('plannedStockModalTitle');
    const modalSubtitle = document.getElementById('plannedStockModalSubtitle');
    const modalSubmitText = document.getElementById('modalSubmitText');
    const entryId = document.getElementById('plannedStockId');
    const entryProduct = document.getElementById('entryProduct');
    const entryScope = document.getElementById('entryScope');
    const entryBoxes = document.getElementById('entryBoxes');
    const entryEta = document.getElementById('entryEta');
    const entryLabel = document.getElementById('entryLabel');
    const entryIsActive = document.getElementById('entryIsActive');

    if (!modal || !modalTitle || !entryProduct || !entryScope || !entryBoxes || !entryIsActive) {
        return;
    }

    if (mode === 'edit' && entry) {
        modalTitle.textContent = translate('plannedStock.modal.editTitle', null, 'Edit plan');
        modalSubtitle.textContent = translate('plannedStock.modal.editSubtitle', null, 'Update scope, quantity, or ETA for the existing plan.');
        if (modalSubmitText) {
            modalSubmitText.textContent = translate('plannedStock.modal.updateAction', null, 'Update');
        }
        entryBoxes.min = '0';

        entryId.value = entry.id;
        entryProduct.value = String(entry.product_id || '');
        entryScope.value = entry.scope || 'committed';
        const existingBoxes = Number(entry.quantity_boxes);
        entryBoxes.value = Number.isFinite(existingBoxes) ? String(existingBoxes) : '';
        entryEta.value = entry.eta_date || '';
        entryLabel.value = entry.label || '';
        entryIsActive.checked = Number(entry.is_active ?? 1) === 1;
    } else {
        resetPlannedStockForm();
        modalTitle.textContent = translate('plannedStock.modal.title', null, 'New plan');
        modalSubtitle.textContent = translate('plannedStock.modal.subtitle', null, 'Define additional boxes for a product.');
        if (modalSubmitText) {
            modalSubmitText.textContent = translate('plannedStock.modal.createAction', null, 'Create');
        }
        entryBoxes.min = '1';

        entryProduct.value = '';
        entryEta.value = '';
        entryLabel.value = '';
    }

    if (modal) {
        modal.dataset.mode = mode;
    }

    modal.classList.remove('hidden');

    requestAnimationFrame(() => {
        entryProduct?.focus();
    });
}

function closePlannedStockModal() {
    const modal = document.getElementById('plannedStockModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.removeAttribute('data-mode');
    }

    if (modalMode === 'create') {
        resetPlannedStockForm();
    }
}

async function handlePlannedStockSubmit(event) {
    event.preventDefault();

    const entryId = document.getElementById('plannedStockId');
    const entryProduct = document.getElementById('entryProduct');
    const entryScope = document.getElementById('entryScope');
    const entryBoxes = document.getElementById('entryBoxes');
    const entryEta = document.getElementById('entryEta');
    const entryLabel = document.getElementById('entryLabel');
    const entryIsActive = document.getElementById('entryIsActive');

    const productId = Number(entryProduct?.value || 0);
    const scope = entryScope?.value || 'committed';
    const boxesValueRaw = entryBoxes?.value || '';
    const boxesValue = boxesValueRaw === '' ? NaN : Number(boxesValueRaw);
    const etaDate = entryEta?.value || '';
    const label = entryLabel?.value?.trim() || '';
    const isActive = entryIsActive?.checked ?? true;

    if (!productId) {
        showError(translate('plannedStock.validation.productRequired', null, 'Please select a product.'));
        return;
    }
    if (!Number.isFinite(boxesValue) || boxesValue < 0) {
        showError(translate('plannedStock.validation.boxesInvalid', null, 'Please enter a valid number of boxes.'));
        return;
    }
    if (modalMode === 'create' && boxesValue < 1) {
        showError(translate('plannedStock.validation.createMinimumBoxes', null, 'New plans require at least one box.'));
        return;
    }
    if (!['committed', 'simulation'].includes(scope)) {
        showError(translate('plannedStock.validation.scopeInvalid', null, 'Invalid scope selected.'));
        return;
    }
    if (etaDate && !/^\d{4}-\d{2}-\d{2}$/.test(etaDate)) {
        showError(translate('plannedStock.validation.etaInvalid', null, 'ETA must use YYYY-MM-DD format.'));
        return;
    }

    try {
        if (modalMode === 'create') {
            await createPlannedStock({
                product_id: productId,
                quantity_boxes: boxesValue,
                scope,
                eta_date: etaDate || null,
                label: label || null,
                is_active: isActive
            });
            showSuccess(translate('plannedStock.alerts.created', null, 'Plan created.'));
        } else {
            const payload = {
                id: Number(entryId?.value || 0)
            };
            if (!payload.id) {
                showError(translate('plannedStock.errors.unknownEntry', null, 'Unable to identify the plan entry.'));
                return;
            }
            payload.product_id = productId;
            payload.scope = scope;
            payload.eta_date = etaDate || null;
            payload.label = label || null;
            payload.is_active = isActive;
            if (boxesValue > 0) {
                payload.quantity_boxes = boxesValue;
            }

            await updatePlannedStock(payload);
            showSuccess(translate('plannedStock.alerts.updated', null, 'Plan updated.'));
        }

        closePlannedStockModal();
        await loadPlannedStock();
    } catch (error) {
        console.error('Submit planned stock failed', error);
        showError(error.message || translate('plannedStock.errors.saveFailed', null, 'Unable to save plan.'));
    }
}

async function createPlannedStock(payload) {
    const response = await fetch(`${API_BASE}/planned_stock/create_planned_stock.php`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || translate('plannedStock.errors.createFailed', null, 'Failed to create plan.'));
    }
}

async function updatePlannedStock(payload) {
    const response = await fetch(`${API_BASE}/planned_stock/update_planned_stock.php`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || translate('plannedStock.errors.updateFailed', null, 'Failed to update plan.'));
    }
}

async function deletePlannedStock(id) {
    const response = await fetch(`${API_BASE}/planned_stock/delete_planned_stock.php`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ id })
    });

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || translate('plannedStock.errors.deleteFailed', null, 'Failed to delete plan.'));
    }
}

async function handleTableAction(event) {
    const button = event.target.closest('.action-button');
    if (!button) {
        return;
    }

    const action = button.dataset.action;
    const id = Number(button.dataset.id || 0);
    if (!id) {
        return;
    }

    const entry = plannedStockRows.find((row) => Number(row.id) === id);
    if (!entry) {
        showError(translate('plannedStock.errors.entryNotFound', null, 'Entry could not be found.'));
        return;
    }

    if (action === 'edit') {
        openPlannedStockModal('edit', entry);
        return;
    }

    if (action === 'toggle-active') {
        const isCurrentlyActive = Number(entry.is_active ?? 1) === 1;
        const message = isCurrentlyActive
            ? translate('plannedStock.prompts.deactivate', null, 'Deactivate plan? It will be removed from totals.')
            : translate('plannedStock.prompts.activate', null, 'Activate plan? It will count toward totals again.');
        if (!confirm(message)) {
            return;
        }
        try {
            await updatePlannedStock({
                id,
                is_active: !isCurrentlyActive
            });
            showSuccess(translate('plannedStock.alerts.statusChanged', null, 'Status updated.'));
            await loadPlannedStock();
        } catch (error) {
            console.error('Toggle active failed', error);
            showError(error.message || translate('plannedStock.errors.toggleFailed', null, 'Failed to change status.'));
        }
        return;
    }

    if (action === 'delete') {
        const message = translate('plannedStock.prompts.delete', null, 'Delete plan? This marks the entry inactive.');
        if (!confirm(message)) {
            return;
        }
        try {
            await deletePlannedStock(id);
            showSuccess(translate('plannedStock.alerts.deleted', null, 'Plan deleted.'));
            await loadPlannedStock();
        } catch (error) {
            console.error('Delete planned stock failed', error);
            showError(error.message || translate('plannedStock.errors.deleteFailed', null, 'Failed to delete plan.'));
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    initializeHeader();
    bindEventHandlers();

    try {
        await loadProducts();
    } finally {
        await loadPlannedStock();
    }
});
