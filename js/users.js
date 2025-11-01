/**
 * WarehouseWrangler - User Management JavaScript
 */

// Configuration
const API_BASE = './api';
let currentUsers = [];
let editingUserId = null;

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
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay && !userDisplay.dataset.userDisplayHydrated) {
        userDisplay.textContent = translate('common.user.anonymous', null, 'User');
    }

    if (userData && userDisplay) {
        userDisplay.textContent = userData.username;
        userDisplay.removeAttribute('data-i18n');
        userDisplay.removeAttribute('data-i18n-attr');
        userDisplay.removeAttribute('data-i18n-args');
        userDisplay.dataset.userDisplayHydrated = 'true';
    }

    // Setup logout
    document.getElementById('logoutBtn').addEventListener('click', function() {
        const confirmMessage = translate(
            'common.prompts.logoutConfirm',
            null,
            'Are you sure you want to log out?'
        );

        if (confirm(confirmMessage)) {
            localStorage.removeItem('ww_auth_token');
            localStorage.removeItem('ww_user_data');
            window.location.href = 'login.html';
        }
    });

    // Setup add user button
    document.getElementById('addUserBtn').addEventListener('click', openAddUserModal);

    // Setup forms
    document.getElementById('userForm').addEventListener('submit', handleUserSubmit);
    document.getElementById('passwordForm').addEventListener('submit', handlePasswordSubmit);

    // Modal close buttons
    document.querySelectorAll('[data-modal-close]').forEach((button) => {
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-modal-close');
            if (target === 'user') {
                closeUserModal();
            } else if (target === 'password') {
                closePasswordModal();
            }
        });
    });

    // Table action delegation
    document.getElementById('usersTableBody').addEventListener('click', handleTableClick);

    // Load users
    loadUsers();
});

// ============================================================================
// API CALLS
// ============================================================================

async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users/get_users.php`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (data.success) {
            currentUsers = data.users;
            renderUsersTable(data.users);
        } else {
            const loadFailedMessage = data && data.error
                ? translate(
                    'users.notifications.loadFailed',
                    { error: data.error },
                    'Failed to load users: {error}'
                )
                : translate(
                    'users.notifications.loadFailedGeneric',
                    null,
                    'Failed to load users.'
                );

            showError(loadFailedMessage);
        }
    } catch (error) {
        console.error('Load users error:', error);
        showError(translate('common.errors.connection', null, 'Connection error. Please try again.'));
    }
}

async function createUser(userData) {
    try {
        const response = await fetch(`${API_BASE}/users/create_user.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Create user error:', error);
        throw error;
    }
}

async function updateUser(userData) {
    try {
        const response = await fetch(`${API_BASE}/users/update_user.php`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Update user error:', error);
        throw error;
    }
}

async function changePassword(userId, currentPassword, newPassword) {
    try {
        const payload = {
            user_id: userId,
            new_password: newPassword
        };

        // Only include current password if user is changing their own
        const currentUser = getCurrentUser();
        if (currentUser && currentUser.id === userId) {
            payload.current_password = currentPassword;
        }

        const response = await fetch(`${API_BASE}/users/change_password.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Change password error:', error);
        throw error;
    }
}

// ============================================================================
// UI RENDERING
// ============================================================================

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');

    if (users.length === 0) {
        const emptyMessage = escapeHtml(translate('users.table.empty', null, 'No users found'));
        tbody.innerHTML = `<tr><td colspan="6" class="table-loading">${emptyMessage}</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(user => {
        const status = user.is_active ? 'active' : 'inactive';
        const statusLabel = escapeHtml(
            translate(
                user.is_active ? 'users.table.status.active' : 'users.table.status.inactive',
                null,
                user.is_active ? 'Active' : 'Inactive'
            )
        );
        const lastLogin = escapeHtml(formatDate(user.last_login));

        let actionsMarkup = `<span class="protected-account">${escapeHtml(translate('users.table.actions.protected', null, 'Protected account'))}</span>`;

        if (user.username !== 'admin') {
            const toggleAction = user.is_active ? 'deactivate' : 'activate';
            const toggleIcon = user.is_active ? 'block' : 'check_circle';
            const toggleClass = user.is_active ? 'danger' : 'success';
            const toggleLabel = translate(
                user.is_active ? 'users.table.actions.deactivate' : 'users.table.actions.activate',
                null,
                user.is_active ? 'Deactivate user' : 'Activate user'
            );
            const editLabel = translate('users.table.actions.edit', null, 'Edit user');
            const passwordLabel = translate('users.table.actions.changePassword', null, 'Change password');

            actionsMarkup = `
                <div class="action-toolbar">
                    <button type="button" class="table-action" data-action="edit" data-user-id="${user.user_id}" title="${escapeHtml(editLabel)}">
                        <span class="material-icons-outlined" aria-hidden="true">edit</span>
                        <span class="visually-hidden">${escapeHtml(editLabel)}</span>
                    </button>
                    <button type="button" class="table-action" data-action="password" data-user-id="${user.user_id}" title="${escapeHtml(passwordLabel)}">
                        <span class="material-icons-outlined" aria-hidden="true">lock_reset</span>
                        <span class="visually-hidden">${escapeHtml(passwordLabel)}</span>
                    </button>
                    <button type="button" class="table-action ${toggleClass}" data-action="${toggleAction}" data-user-id="${user.user_id}" title="${escapeHtml(toggleLabel)}">
                        <span class="material-icons-outlined" aria-hidden="true">${toggleIcon}</span>
                        <span class="visually-hidden">${escapeHtml(toggleLabel)}</span>
                    </button>
                </div>
            `;
        }

        return `
            <tr>
                <td><strong>${escapeHtml(user.username)}</strong></td>
                <td>${escapeHtml(user.email)}</td>
                <td><span class="role-badge role-${user.role}">${user.role}</span></td>
                <td><span class="status-badge status-${status}">${statusLabel}</span></td>
                <td>${lastLogin}</td>
                <td>${actionsMarkup}</td>
            </tr>
        `;
    }).join('');
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

function openAddUserModal() {
    editingUserId = null;
    document.getElementById('modalTitle').textContent = translate('users.modals.addTitle', null, 'Add New User');
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('username').disabled = false;
    document.getElementById('password').required = true;
    document.getElementById('passwordGroup').classList.remove('hidden');
    document.getElementById('userModal').classList.remove('hidden');
}

function openEditUserModal(userId) {
    const user = currentUsers.find(u => u.user_id === userId);
    if (!user) return;

    editingUserId = userId;
    document.getElementById('modalTitle').textContent = translate('users.modals.editTitle', null, 'Edit User');
    document.getElementById('userId').value = user.user_id;
    document.getElementById('username').value = user.username;
    document.getElementById('username').disabled = true;
    document.getElementById('email').value = user.email;
    document.getElementById('role').value = user.role;
    document.getElementById('isActive').checked = user.is_active == 1;
    document.getElementById('password').required = false;
    document.getElementById('passwordGroup').classList.add('hidden');
    document.getElementById('userModal').classList.remove('hidden');
}

function closeUserModal() {
    document.getElementById('userModal').classList.add('hidden');
    document.getElementById('userForm').reset();
    editingUserId = null;
}

function openChangePasswordModal(userId) {
    document.getElementById('passwordUserId').value = userId;
    document.getElementById('passwordForm').reset();

    // Show/hide current password field based on whether user is changing own password
    const currentUser = getCurrentUser();
    const isOwnPassword = currentUser && currentUser.id === userId;
    const currentPasswordGroup = document.getElementById('currentPasswordGroup');
    currentPasswordGroup.classList.toggle('hidden', !isOwnPassword);
    document.getElementById('currentPassword').required = isOwnPassword;

    document.getElementById('passwordModal').classList.remove('hidden');
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.add('hidden');
    document.getElementById('passwordForm').reset();
}

// ============================================================================
// FORM HANDLERS
// ============================================================================

async function handleUserSubmit(e) {
    e.preventDefault();

    const formData = {
        username: document.getElementById('username').value.trim(),
        email: document.getElementById('email').value.trim(),
        role: document.getElementById('role').value,
        is_active: document.getElementById('isActive').checked
    };

    if (editingUserId) {
        // Update existing user
        formData.user_id = editingUserId;
        const result = await updateUser(formData);

        if (result.success) {
            showSuccess(translate('users.notifications.updateSuccess', null, 'User updated successfully!'));
            closeUserModal();
            loadUsers();
        } else {
            const defaultMessage = translate('users.notifications.updateError', null, 'Failed to update user.');
            showError(result.error || defaultMessage);
        }
    } else {
        // Create new user
        formData.password = document.getElementById('password').value;
        const result = await createUser(formData);

        if (result.success) {
            showSuccess(translate('users.notifications.createSuccess', null, 'User created successfully!'));
            closeUserModal();
            loadUsers();
        } else {
            const defaultMessage = translate('users.notifications.createError', null, 'Failed to create user.');
            showError(result.error || defaultMessage);
        }
    }
}

async function handlePasswordSubmit(e) {
    e.preventDefault();

    const userId = parseInt(document.getElementById('passwordUserId').value, 10);
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validate passwords match
    if (newPassword !== confirmPassword) {
        showError(translate('users.notifications.passwordMismatch', null, 'New passwords do not match!'));
        return;
    }

    const result = await changePassword(userId, currentPassword, newPassword);

    if (result.success) {
        showSuccess(translate('users.notifications.passwordChangeSuccess', null, 'Password changed successfully!'));
        closePasswordModal();
    } else {
        const defaultMessage = translate('users.notifications.passwordChangeError', null, 'Failed to change password.');
        showError(result.error || defaultMessage);
    }
}

async function toggleUserStatus(userId, activate) {
    const confirmMessage = translate(
        activate ? 'users.prompts.activateConfirm' : 'users.prompts.deactivateConfirm',
        null,
        activate
            ? 'Are you sure you want to activate this user?'
            : 'Are you sure you want to deactivate this user?'
    );

    if (!confirm(confirmMessage)) {
        return;
    }

    const result = await updateUser({
        user_id: userId,
        is_active: activate
    });

    if (result.success) {
        const successMessage = translate(
            activate ? 'users.notifications.activateSuccess' : 'users.notifications.deactivateSuccess',
            null,
            activate ? 'User activated successfully!' : 'User deactivated successfully!'
        );
        showSuccess(successMessage);
        loadUsers();
    } else {
        const fallbackMessage = translate(
            activate ? 'users.notifications.activateError' : 'users.notifications.deactivateError',
            null,
            activate ? 'Failed to activate user.' : 'Failed to deactivate user.'
        );
        showError(result.error || fallbackMessage);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showSuccess(message) {
    const normalizedMessage = message != null ? String(message) : '';
    const alertMessage = translate(
        'common.alerts.success',
        { message: normalizedMessage },
        'Success: {message}'
    );
    alert(alertMessage);
}

function showError(message) {
    const normalizedMessage = message != null ? String(message) : '';
    const alertMessage = translate(
        'common.alerts.error',
        { message: normalizedMessage },
        'Error: {message}'
    );
    alert(alertMessage);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) {
        return translate('users.table.lastLogin.never', null, 'Never');
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return translate('users.table.lastLogin.never', null, 'Never');
    }

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

function handleTableClick(event) {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
        return;
    }

    const userId = parseInt(actionButton.dataset.userId, 10);
    const action = actionButton.dataset.action;

    if (!Number.isInteger(userId)) {
        return;
    }

    switch (action) {
        case 'edit':
            openEditUserModal(userId);
            break;
        case 'password':
            openChangePasswordModal(userId);
            break;
        case 'activate':
            toggleUserStatus(userId, true);
            break;
        case 'deactivate':
            toggleUserStatus(userId, false);
            break;
        default:
            break;
    }
}
