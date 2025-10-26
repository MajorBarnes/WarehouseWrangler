/**
 * WarehouseWrangler - User Management JavaScript
 */

// Configuration
const API_BASE = './api';
let currentUsers = [];
let editingUserId = null;

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

    // Setup add user button
    document.getElementById('addUserBtn').addEventListener('click', openAddUserModal);

    // Setup forms
    document.getElementById('userForm').addEventListener('submit', handleUserSubmit);
    document.getElementById('passwordForm').addEventListener('submit', handlePasswordSubmit);

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
            showError('Failed to load users: ' + data.error);
        }
    } catch (error) {
        console.error('Load users error:', error);
        showError('Connection error. Please try again.');
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
        if (currentUser.id === userId) {
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
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td><strong>${escapeHtml(user.username)}</strong></td>
            <td>${escapeHtml(user.email)}</td>
            <td><span class="role-badge role-${user.role}">${user.role}</span></td>
            <td><span class="status-badge status-${user.is_active ? 'active' : 'inactive'}">
                ${user.is_active ? 'Active' : 'Inactive'}
            </span></td>
            <td>${user.last_login ? formatDate(user.last_login) : 'Never'}</td>
            <td>
                ${user.username === 'admin' ? 
                    '<em style="color: #999;">Protected account</em>' : 
                    `<div class="action-buttons">
                        <button class="btn-primary btn-small" onclick="openEditUserModal(${user.user_id})">
                            Edit
                        </button>
                        <button class="btn-secondary btn-small" onclick="openChangePasswordModal(${user.user_id})">
                            Password
                        </button>
                        ${user.is_active ? 
                            `<button class="btn-danger btn-small" onclick="toggleUserStatus(${user.user_id}, false)">Deactivate</button>` :
                            `<button class="btn-success btn-small" onclick="toggleUserStatus(${user.user_id}, true)">Activate</button>`
                        }
                    </div>`
                }
            </td>
        </tr>
    `).join('');
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

function openAddUserModal() {
    editingUserId = null;
    document.getElementById('modalTitle').textContent = 'Add New User';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('username').disabled = false;
    document.getElementById('password').required = true;
    document.getElementById('passwordGroup').style.display = 'block';
    document.getElementById('userModal').classList.remove('hidden');
}

function openEditUserModal(userId) {
    const user = currentUsers.find(u => u.user_id === userId);
    if (!user) return;

    editingUserId = userId;
    document.getElementById('modalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = user.user_id;
    document.getElementById('username').value = user.username;
    document.getElementById('username').disabled = true;
    document.getElementById('email').value = user.email;
    document.getElementById('role').value = user.role;
    document.getElementById('isActive').checked = user.is_active == 1;
    document.getElementById('password').required = false;
    document.getElementById('passwordGroup').style.display = 'none';
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
    const isOwnPassword = (currentUser.id === userId);
    document.getElementById('currentPasswordGroup').style.display = isOwnPassword ? 'block' : 'none';
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
            showSuccess('User updated successfully!');
            closeUserModal();
            loadUsers();
        } else {
            showError(result.error || 'Failed to update user');
        }
    } else {
        // Create new user
        formData.password = document.getElementById('password').value;
        const result = await createUser(formData);
        
        if (result.success) {
            showSuccess('User created successfully!');
            closeUserModal();
            loadUsers();
        } else {
            showError(result.error || 'Failed to create user');
        }
    }
}

async function handlePasswordSubmit(e) {
    e.preventDefault();

    const userId = parseInt(document.getElementById('passwordUserId').value);
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validate passwords match
    if (newPassword !== confirmPassword) {
        showError('New passwords do not match!');
        return;
    }

    const result = await changePassword(userId, currentPassword, newPassword);

    if (result.success) {
        showSuccess('Password changed successfully!');
        closePasswordModal();
    } else {
        showError(result.error || 'Failed to change password');
    }
}

async function toggleUserStatus(userId, activate) {
    const action = activate ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
        return;
    }

    const result = await updateUser({
        user_id: userId,
        is_active: activate
    });

    if (result.success) {
        showSuccess(`User ${action}d successfully!`);
        loadUsers();
    } else {
        showError(result.error || `Failed to ${action} user`);
    }
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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
