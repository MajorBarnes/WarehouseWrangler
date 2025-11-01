/**
 * WarehouseWrangler - Products Management JavaScript
 * 
 * UPDATED: Seasonal factors now link by product_id (not product_name)
 * 
 * Handles CRUD operations for products/articles with seasonal factors
 */

// Configuration
const API_BASE = './api';
let allProducts = [];
let filteredProducts = [];
let editingProductId = null;
let currentProductForFactors = null;

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

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    initializeHeader();

    // Load products
    loadProducts();

    // Setup search
    document.getElementById('searchInput').addEventListener('keyup', filterProducts);
    
    // Setup forms
    document.getElementById('productForm').addEventListener('submit', handleProductSubmit);
    document.getElementById('factorsForm').addEventListener('submit', handleFactorsSubmit);
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
                if (userData && userData.username) {
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
        logoutBtn.addEventListener('click', function() {
            const message = translate('common.prompts.logoutConfirm', null, 'Are you sure you want to log out?');
            if (confirm(message)) {
                localStorage.removeItem('ww_auth_token');
                localStorage.removeItem('ww_user_data');
                window.location.href = 'login.html';
            }
        });
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getToken() {
    return localStorage.getItem('ww_auth_token');
}

function showSuccess(message) {
    alert(translate('products.alerts.success', { message }, 'Success: {message}'));
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
    setTimeout(() => {
        errorDiv.innerHTML = '';
    }, 5000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeForClass(value) {
    return value
        .toLowerCase()
        .normalize('NFD').replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
}

// ============================================================================
// API CALLS
// ============================================================================

async function loadProducts() {
    try {
        document.getElementById('loadingIndicator').style.display = 'block';
        
        const token = getToken();
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        const response = await fetch(`${API_BASE}/products/get_all.php`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('ww_auth_token');
                window.location.href = 'login.html';
                return;
            }
            const fallback = translate('products.messages.loadFailed', null, 'Failed to load products.');
            throw new Error(data.error || fallback);
        }

        if (data.success) {
            allProducts = data.products;
            filteredProducts = allProducts;
            renderProducts();
        } else {
            const fallback = translate('products.messages.unknown', null, 'Unknown error.');
            throw new Error(data.error || fallback);
        }

    } catch (error) {
        const message = translate('products.messages.loadError', { message: error.message }, 'Error loading products: {message}');
        showError(message);
        console.error('Load products error:', error);
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

async function createProduct(productData) {
    try {
        const response = await fetch(`${API_BASE}/products/create.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(productData)
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Create product error:', error);
        throw error;
    }
}

async function updateProduct(productData) {
    try {
        const response = await fetch(`${API_BASE}/products/update.php`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(productData)
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Update product error:', error);
        throw error;
    }
}

async function deleteProduct(productId) {
    try {
        const response = await fetch(`${API_BASE}/products/delete.php`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ product_id: productId })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Delete product error:', error);
        throw error;
    }
}

async function updateSeasonalFactors(productId, factors) {
    try {
        const response = await fetch(`${API_BASE}/products/update_factors.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                product_id: productId,
                factors: factors
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Update factors error:', error);
        throw error;
    }
}

// ============================================================================
// UI RENDERING
// ============================================================================

function renderProducts() {
    const tbody = document.getElementById('productsTableBody');
    const table = document.getElementById('productsTable');
    const noResults = document.getElementById('noResults');
    const tableContainer = document.querySelector('.table-scroll');

    if (filteredProducts.length === 0) {
        table.classList.add('is-hidden');
        if (tableContainer) {
            tableContainer.classList.add('is-hidden');
        }
        noResults.classList.remove('is-hidden');
        tbody.innerHTML = '';
        return;
    }

    table.classList.remove('is-hidden');
    if (tableContainer) {
        tableContainer.classList.remove('is-hidden');
    }
    noResults.classList.add('is-hidden');

    tbody.innerHTML = filteredProducts.map(product => {
        const colorLabel = product.color ? escapeHtml(product.color) : '';
        const sanitizedColor = product.color ? sanitizeForClass(product.color) : '';
        const colorClass = sanitizedColor ? ` color-${sanitizedColor}` : '';
        const fallbackName = translate('products.table.fallbackName', null, 'Product');
        const rawProductLabel = product.product_name || product.artikel || fallbackName;
        const productLabel = escapeHtml(rawProductLabel);
        const editTooltip = escapeHtml(translate('products.tooltips.edit', null, 'Edit'));
        const deleteTooltip = escapeHtml(translate('products.tooltips.delete', null, 'Delete'));
        const factorsAria = escapeHtml(
            translate('products.aria.editFactors', { product: rawProductLabel }, 'Edit seasonal factors for {product}')
        );
        const editAria = escapeHtml(
            translate('products.aria.editProduct', { product: rawProductLabel }, 'Edit product {product}')
        );
        const deleteAria = escapeHtml(
            translate('products.aria.deleteProduct', { product: rawProductLabel }, 'Delete product {product}')
        );

        return `
        <tr>
            <td>
                <div class="product-name">${escapeHtml(product.product_name || '-')}</div>
                <div class="product-code">${escapeHtml(product.artikel || '-')}</div>
            </td>
            <td>${escapeHtml(product.artikel || '-')}</td>
            <td class="product-code">${escapeHtml(product.fnsku || '-')}</td>
            <td class="product-code">${escapeHtml(product.asin || '-')}</td>
            <td class="product-code">${escapeHtml(product.sku || '-')}</td>
            <td class="product-code">${escapeHtml(product.ean || '-')}</td>
            <td class="numeric">${product.pairs_per_box || '-'}</td>
            <td>
                ${product.color ? `<span class="color-badge${colorClass}">${colorLabel}</span>` : '-'}
            </td>
            <td class="factors-cell">
                <button type="button" class="factors-trigger" onclick="openFactorsModal(${product.product_id})" aria-label="${factorsAria}">
                    ${renderFactorsPreview(product.seasonal_factors)}
                </button>
            </td>
            <td class="actions">
                <button
                    type="button"
                    class="btn btn-secondary icon-button"
                    data-tooltip="${editTooltip}"
                    aria-label="${editAria}"
                    onclick="openEditProductModal(${product.product_id})"
                >
                    <span class="material-icons-outlined" aria-hidden="true">edit</span>
                </button>
                <button
                    type="button"
                    class="btn btn-destructive icon-button"
                    data-tooltip="${deleteTooltip}"
                    aria-label="${deleteAria}"
                    onclick="handleDeleteProduct(${product.product_id})"
                >
                    <span class="material-icons-outlined" aria-hidden="true">delete</span>
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

function renderFactorsPreview(factors) {
    if (!factors) {
        const label = escapeHtml(translate('products.factors.empty', null, 'No factors'));
        return `<span class="factors-empty">${label}</span>`;
    }

    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const factorValues = months.map(m => factors[m] || 1.0);

    return `
        <div class="factors-preview" aria-hidden="true">
            ${factorValues.map(val => {
                const className = val > 1.2 ? ' factor-high' : (val < 0.8 ? ' factor-low' : '');
                return `<span class="factor-mini${className}">${val.toFixed(1)}</span>`;
            }).join('')}
        </div>
    `;
}

function filterProducts() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    if (!searchTerm) {
        filteredProducts = allProducts;
    } else {
        filteredProducts = allProducts.filter(product => {
            return (
                (product.artikel && product.artikel.toLowerCase().includes(searchTerm)) ||
                (product.product_name && product.product_name.toLowerCase().includes(searchTerm)) ||
                (product.fnsku && product.fnsku.toLowerCase().includes(searchTerm)) ||
                (product.asin && product.asin.toLowerCase().includes(searchTerm)) ||
                (product.sku && product.sku.toLowerCase().includes(searchTerm)) ||
                (product.ean && product.ean.toLowerCase().includes(searchTerm))
            );
        });
    }
    
    renderProducts();
}

// ============================================================================
// PRODUCT MODAL MANAGEMENT
// ============================================================================

function openAddProductModal() {
    editingProductId = null;
    document.getElementById('modalTitle').textContent = translate('products.modal.createTitle', null, 'New product');
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('fnsku').disabled = false;
    document.getElementById('productModal').classList.remove('hidden');
}

function openEditProductModal(productId) {
    const product = allProducts.find(p => p.product_id === productId);
    if (!product) return;

    editingProductId = productId;
    document.getElementById('modalTitle').textContent = translate('products.modal.editTitle', null, 'Edit product');
    document.getElementById('productId').value = product.product_id;
    document.getElementById('artikel').value = product.artikel || '';
    document.getElementById('fnsku').value = product.fnsku || '';
    document.getElementById('fnsku').disabled = true; // Can't change FNSKU
    document.getElementById('asin').value = product.asin || '';
    document.getElementById('sku').value = product.sku || '';
    document.getElementById('ean').value = product.ean || '';
    document.getElementById('productName').value = product.product_name || '';
    document.getElementById('pairsPerBox').value = product.pairs_per_box || '';
    document.getElementById('color').value = product.color || '';
    document.getElementById('avgWeeklySales').value = product.average_weekly_sales || '';
    
    document.getElementById('productModal').classList.remove('hidden');
}

function closeProductModal() {
    document.getElementById('productModal').classList.add('hidden');
    document.getElementById('productForm').reset();
    editingProductId = null;
}

// ============================================================================
// SEASONAL FACTORS MODAL MANAGEMENT
// ============================================================================

function openFactorsModal(productId) {
    const product = allProducts.find(p => p.product_id === productId);
    if (!product) return;

    currentProductForFactors = product;

    const factorsTitle = translate('products.factorsModal.title', { artikel: product.artikel || '' }, 'Seasonal factors - {artikel}');
    const productName = translate('products.factorsModal.productLabel', { name: product.product_name || '' }, 'Product: {name}');
    document.getElementById('factorsModalTitle').textContent = factorsTitle;
    document.getElementById('factorsProductName').textContent = productName;
    
    // Fill in current factors
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    months.forEach(month => {
        const value = product.seasonal_factors ? product.seasonal_factors[month] : 1.0;
        document.getElementById(`factor_${month}`).value = value;
    });
    
    document.getElementById('factorsModal').classList.remove('hidden');
}

function closeFactorsModal() {
    document.getElementById('factorsModal').classList.add('hidden');
    currentProductForFactors = null;
}

// ============================================================================
// FORM HANDLERS
// ============================================================================

async function handleProductSubmit(e) {
    e.preventDefault();

    const formData = {
        artikel: document.getElementById('artikel').value.trim(),
        fnsku: document.getElementById('fnsku').value.trim(),
        asin: document.getElementById('asin').value.trim() || null,
        sku: document.getElementById('sku').value.trim() || null,
        ean: document.getElementById('ean').value.trim() || null,
        product_name: document.getElementById('productName').value.trim(),
        pairs_per_box: parseInt(document.getElementById('pairsPerBox').value),
        color: document.getElementById('color').value.trim() || null,
        average_weekly_sales: parseFloat(document.getElementById('avgWeeklySales').value) || 0
    };

    try {
        if (editingProductId) {
            // Update existing product
            formData.product_id = editingProductId;
            const result = await updateProduct(formData);

            if (result.success) {
                showSuccess(translate('products.messages.updateSuccess', null, 'Product updated successfully!'));
                closeProductModal();
                loadProducts();
            } else {
                const fallback = translate('products.messages.updateFailure', null, 'Failed to update product.');
                showError(result.error || fallback);
            }
        } else {
            // Create new product
            const result = await createProduct(formData);

            if (result.success) {
                showSuccess(translate('products.messages.createSuccess', null, 'Product created successfully!'));
                closeProductModal();
                loadProducts();
            } else {
                const fallback = translate('products.messages.createFailure', null, 'Failed to create product.');
                showError(result.error || fallback);
            }
        }
    } catch (error) {
        const message = translate('products.messages.connectionError', { message: error.message }, 'Connection error: {message}');
        showError(message);
    }
}

async function handleFactorsSubmit(e) {
    e.preventDefault();

    if (!currentProductForFactors) return;

    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const factors = {};
    
    months.forEach(month => {
        factors[month] = parseFloat(document.getElementById(`factor_${month}`).value) || 1.0;
    });

    try {
        // UPDATED: Now uses product_id instead of product_name
        const result = await updateSeasonalFactors(currentProductForFactors.product_id, factors);
        
        if (result.success) {
            showSuccess(translate('products.messages.factorsUpdateSuccess', null, 'Seasonal factors updated!'));
            closeFactorsModal();
            loadProducts();
        } else {
            const fallback = translate('products.messages.factorsUpdateFailure', null, 'Failed to update seasonal factors.');
            showError(result.error || fallback);
        }
    } catch (error) {
        const message = translate('products.messages.connectionError', { message: error.message }, 'Connection error: {message}');
        showError(message);
    }
}

async function handleDeleteProduct(productId) {
    const product = allProducts.find(p => p.product_id === productId);
    if (!product) return;

    const confirmMsg = translate(
        'products.alerts.deleteConfirm',
        { artikel: product.artikel || '' },
        'Delete article "{artikel}"?\n\nThis cannot be undone!'
    );
    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        const result = await deleteProduct(productId);

        if (result.success) {
            showSuccess(translate('products.messages.deleteSuccess', null, 'Product deleted successfully!'));
            loadProducts();
        } else {
            const fallback = translate('products.messages.deleteFailure', null, 'Failed to delete product.');
            showError(result.error || fallback);
        }
    } catch (error) {
        const message = translate('products.messages.connectionError', { message: error.message }, 'Connection error: {message}');
        showError(message);
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function setAllFactors(value) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    months.forEach(month => {
        document.getElementById(`factor_${month}`).value = value;
    });
}

function resetFactorsToDefault() {
    const message = translate('products.alerts.resetConfirm', null, 'Reset all factors to 1.0?');
    if (confirm(message)) {
        setAllFactors(1.0);
    }
}
