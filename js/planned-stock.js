/**
 * WarehouseWrangler - Planned Stock Management
 */

const API_BASE = './api';
let plannedStockRows = [];
let productsIndex = new Map();
let modalMode = 'create';

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
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }
    return date.toLocaleDateString('de-DE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showSuccess(message) {
    window.alert(`Erfolg: ${message}`);
}

function showError(message) {
    window.alert(`Fehler: ${message}`);
}

function initializeHeader() {
    const userDisplay = document.getElementById('userDisplay');
    const user = getCurrentUser();
    if (userDisplay) {
        userDisplay.textContent = user?.username || 'Benutzer';
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Möchtest du dich wirklich abmelden?')) {
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
            showError('Produkte konnten nicht geladen werden.');
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
            options.push({
                id: Number(product.product_id),
                label: `${product.artikel ?? 'Unbekannt'} – ${product.product_name ?? ''}`.trim()
            });
        });

        productsIndex = productMap;
        populateProductSelects(options.sort((a, b) => a.label.localeCompare(b.label, 'de')));
    } catch (error) {
        console.error('Load products failed', error);
        showError('Produkte konnten nicht geladen werden.');
    }
}

function populateProductSelects(options) {
    const productFilter = document.getElementById('productFilter');
    const entryProduct = document.getElementById('entryProduct');

    if (productFilter) {
        const current = productFilter.value;
        productFilter.innerHTML = '<option value="">Alle Produkte</option>' + options.map((option) => {
            return `<option value="${option.id}">${escapeHtml(option.label)}</option>`;
        }).join('');
        if (current) {
            productFilter.value = current;
        }
    }

    if (entryProduct) {
        const current = entryProduct.value;
        entryProduct.innerHTML = '<option value="">Produkt wählen</option>' + options.map((option) => {
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
            throw new Error(data.error || 'Unbekannter Fehler');
        }

        plannedStockRows = Array.isArray(data.data) ? data.data : [];
        renderSummary();
        renderPlannedStockTable();
    } catch (error) {
        console.error('Load planned stock failed', error);
        showError('Geplante Bestände konnten nicht geladen werden.');
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
        const productName = row.product_name || productInfo?.product_name || 'Unbekanntes Produkt';
        const artikel = productInfo?.artikel ? `Artikel ${productInfo.artikel}` : 'Artikel unbekannt';
        const scopeValue = (row.scope || 'committed').toLowerCase();
        const scopeLabel = scopeValue === 'simulation' ? 'Simulation' : 'Committed';
        const boxes = Number(row.quantity_boxes) || 0;
        const pairsPerBox = Number(row.pairs_per_box) || productInfo?.pairs_per_box || 0;
        const pairs = boxes * pairsPerBox;
        const label = row.label ? escapeHtml(row.label) : '—';
        const isActive = Number(row.is_active ?? 1) === 1;

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
                    <span class="status-badge ${isActive ? 'is-active' : 'is-inactive'}">${isActive ? 'Aktiv' : 'Inaktiv'}</span>
                </td>
                <td class="actions-col">
                    <div class="actions-toolbar">
                        <button type="button" class="action-button" data-action="edit" data-id="${id}" title="Bearbeiten">
                            <span class="material-icons-outlined" aria-hidden="true">edit</span>
                            <span class="visually-hidden">Bearbeiten</span>
                        </button>
                        <button type="button" class="action-button" data-action="toggle-active" data-id="${id}" title="${isActive ? 'Deaktivieren' : 'Aktivieren'}">
                            <span class="material-icons-outlined" aria-hidden="true">${isActive ? 'toggle_off' : 'toggle_on'}</span>
                            <span class="visually-hidden">Status wechseln</span>
                        </button>
                        <button type="button" class="action-button danger" data-action="delete" data-id="${id}" title="Löschen">
                            <span class="material-icons-outlined" aria-hidden="true">delete</span>
                            <span class="visually-hidden">Löschen</span>
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
        modalTitle.textContent = 'Planung bearbeiten';
        modalSubtitle.textContent = 'Aktualisiere Scope, Menge oder ETA für die bestehende Planung.';
        if (modalSubmitText) {
            modalSubmitText.textContent = 'Aktualisieren';
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
        modalTitle.textContent = 'Neue Planung';
        modalSubtitle.textContent = 'Zusätzliche Boxen und optionales ETA für ein Produkt hinterlegen.';
        if (modalSubmitText) {
            modalSubmitText.textContent = 'Anlegen';
        }
        entryBoxes.min = '1';

        entryId.value = '';
        entryProduct.value = '';
        entryScope.value = 'committed';
        entryBoxes.value = '';
        entryEta.value = '';
        entryLabel.value = '';
        entryIsActive.checked = true;
    }

    modal.classList.remove('hidden');
}

function closePlannedStockModal() {
    const modal = document.getElementById('plannedStockModal');
    if (modal) {
        modal.classList.add('hidden');
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
        showError('Bitte ein Produkt auswählen.');
        return;
    }
    if (!Number.isFinite(boxesValue) || boxesValue < 0) {
        showError('Bitte eine gültige Boxenanzahl angeben.');
        return;
    }
    if (modalMode === 'create' && boxesValue < 1) {
        showError('Neue Planungen benötigen mindestens eine Box.');
        return;
    }
    if (!['committed', 'simulation'].includes(scope)) {
        showError('Ungültiger Scope ausgewählt.');
        return;
    }
    if (etaDate && !/^\d{4}-\d{2}-\d{2}$/.test(etaDate)) {
        showError('ETA muss im Format JJJJ-MM-TT vorliegen.');
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
            showSuccess('Planung wurde angelegt.');
        } else {
            const payload = {
                id: Number(entryId?.value || 0)
            };
            if (!payload.id) {
                showError('Eintrag konnte nicht identifiziert werden.');
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
            showSuccess('Planung wurde aktualisiert.');
        }

        closePlannedStockModal();
        await loadPlannedStock();
    } catch (error) {
        console.error('Submit planned stock failed', error);
        showError(error.message || 'Planung konnte nicht gespeichert werden.');
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
        throw new Error(data.error || 'Anlage fehlgeschlagen');
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
        throw new Error(data.error || 'Aktualisierung fehlgeschlagen');
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
        throw new Error(data.error || 'Löschen fehlgeschlagen');
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
        showError('Eintrag wurde nicht gefunden.');
        return;
    }

    if (action === 'edit') {
        openPlannedStockModal('edit', entry);
        return;
    }

    if (action === 'toggle-active') {
        const isCurrentlyActive = Number(entry.is_active ?? 1) === 1;
        const message = isCurrentlyActive
            ? 'Planung deaktivieren? Sie wird aus Summen entfernt.'
            : 'Planung aktivieren? Sie zählt wieder in den Summen.';
        if (!confirm(message)) {
            return;
        }
        try {
            await updatePlannedStock({
                id,
                is_active: !isCurrentlyActive
            });
            showSuccess('Status wurde geändert.');
            await loadPlannedStock();
        } catch (error) {
            console.error('Toggle active failed', error);
            showError(error.message || 'Statuswechsel fehlgeschlagen.');
        }
        return;
    }

    if (action === 'delete') {
        if (!confirm('Planung wirklich löschen? Dies setzt den Eintrag inaktiv.')) {
            return;
        }
        try {
            await deletePlannedStock(id);
            showSuccess('Planung wurde gelöscht.');
            await loadPlannedStock();
        } catch (error) {
            console.error('Delete planned stock failed', error);
            showError(error.message || 'Planung konnte nicht gelöscht werden.');
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
