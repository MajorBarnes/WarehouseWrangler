# ⚙️ WarehouseWrangler AI Style & Logic Guide

> **Core Principle:** Code readability, modularity, and consistency with database schema and CSS layout.
> Every Codex commit must respect the data model and visual language of WarehouseWrangler.

---

## 0. Collaboration Contract

* All PRs must link to the corresponding rule(s), include before/after screenshots (desktop + narrow), and pass the **UI Acceptance Checklist**.
* Do not alter authentication, header, or navigation components.

---

## 1. Core Identity

| Property        | Value                                           |
| --------------- | ----------------------------------------------- |
| **Project**     | WarehouseWrangler                               |
| **Tone**        | Analytical, clear, trustworthy                  |
| **Design Goal** | Immediate situational awareness of stock health |

---

## 2. Data Model Overview

Codex must align with the **`PRODUCTIVE_DB_SCHEMA.md`**, which provides:

| View / Table              | Purpose                                                    | Key Fields                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `v_product_stock_summary` | Core stock view with total pairs, boxes, and sales metrics | `product_id`, `pairs_per_box`, `average_weekly_sales`, per-location stock columns (`incoming_pairs`, `wml_pairs`, `gmr_pairs`, `amz_pairs`) |
| `product_sales_factors`   | Seasonal multipliers per product and month                 | `product_id`, `month`, `factor`                                                                                                             |
| `system_config`           | Global runtime parameters                                  | `LEAD_TIME_WEEKS`, `AWS_UNIT`, `VARIANCE_THRESHOLD`, etc.                                                                                   |
| `planned_stock`           | *New table* for additional boxes (non-operational)         | `product_id`, `quantity_boxes`, `scope`, `eta_date`, `is_active`                                                                            |

Codex must use these existing views instead of recalculating raw aggregations from cartons or movements.

---

## 3. Dashboard Logic (js/dashboard.js)

**Purpose:**
Render accurate, seasonally adjusted stock coverage per product and location, incorporating additional boxes from `planned_stock`.
Provide clear “weeks of cover” visual feedback and forward projections.

---

### 3.1 Data Sources

| Source                   | Purpose                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `/api/get_all.php`       | Supplies `v_product_stock_summary` data per product.             |
| `/api/config.php`        | Returns system parameters (`LEAD_TIME_WEEKS`, `AWS_UNIT`, etc.). |
| `/api/planned_stock.php` | Returns additional planned boxes (committed & simulation).       |
| Date input field         | Provides user-selected *target date* for projection.             |

---

### 3.2 Units & Formulas

#### Demand

```js
if (AWS_UNIT === 'pairs')
  weekly_demand_pairs = average_weekly_sales * Sf(m);
else
  weekly_demand_pairs = average_weekly_sales * pairs_per_box * Sf(m);
```

* `Sf(m)` = seasonal multiplier for the selected month.
* `average_weekly_sales` comes from `v_product_stock_summary`.

#### Location Coverage

```js
weeks_L = (pairs_L + planned_pairs_L) / weekly_demand_pairs;
```

For each `L ∈ {Incoming, WML, GMR, AMZ}`.
`planned_pairs_L` comes from `planned_stock` (converted from boxes × pairs_per_box) and belongs to the **Additional** bucket.

#### Total Coverage

```js
total_weeks = total_pairs_all_locations / weekly_demand_pairs;
stockout_date = today + (total_weeks * 7 days);
```

#### To-Order Projection

For a user-selected *target date*:

```js
weeks_target = differenceInWeeks(target_date, today);
needed_pairs = max(0, (weeks_target - total_weeks) * weekly_demand_pairs);
needed_boxes = needed_pairs / pairs_per_box;
```

#### Guardrail

If `weekly_demand_pairs <= 0`, mark product as “no demand” (∞ coverage, greyed out).

---

### 3.3 Integration of Additional (Planned) Stock

* The **planned_stock** table represents **additional boxes** per product — not tied to operational locations.
* These are counted under a dedicated **“Additional”** segment on the chart (never moved or deducted elsewhere).
* Default inclusion:

  * `scope = 'committed'`
  * `eta_date IS NULL OR eta_date ≤ CURRENT_DATE()`
  * `is_active = 1`
* Optional toggles enable:

  * Future ETAs
  * Simulation entries (`scope='simulation'`)

**Data flow:**

1. Fetch planned boxes for each product.
2. Convert `quantity_boxes` → pairs (`× pairs_per_box`).
3. Append to the **Additional** segment in both chart and totals.
4. Distinguish committed vs simulation visually:

   * *Committed:* solid fill color (e.g., teal).
   * *Simulation:* hatched overlay.

---

### 3.4 Visualization Specification

| Element          | Description                                                           |          |     |     |     |               |
| ---------------- | --------------------------------------------------------------------- | -------- | --- | --- | ----|-------------- |
| **Bars**         | Horizontal stacked per product:                                       |`[Incoming| WML | GMR | AMZ | Additional]`. |
| **Red Line**     | System threshold (`LEAD_TIME_WEEKS`).                                 |          |     |     |     |               |
| **Green Line**   | User-selected target coverage date.                                   |          |     |     |     |               |
| **Tooltips**     | Pairs, boxes, segment weeks, total weeks, stockout date.              |          |     |     |     |               |
| **Labels**       | Show total coverage, remaining pairs, and “to order” values.          |          |     |     |     |               |
| **Toggle Panel** | Filter visibility of Amazon, internal, and additional stock segments. |          |     |     |     |               |

*Additional segment* should be included in both **internal** and **all** totals, but excluded from shipment calculations.

---

### 3.5 Calculations for Totals and Filters

| Filter               | Includes                          | Excludes   |
| -------------------- | --------------------------------- | ---------- |
| **Internal Only**    | Incoming + WML + GMR + Additional | AMZ        |
| **All (incl. AMZ)**  | All segments                      | –          |
| **Operational Only** | Incoming + WML + GMR + AMZ        | Additional |

Coverage values, to-order projections, and visual indicators must dynamically recompute based on active filters.

---

### 3.6 Accessibility & Performance

* Avoid inline JS; use delegated events.
* Paginate when >100 products.
* Use ARIA labels for chart bars and threshold lines.
* Animate red/green guidelines smoothly (CSS or JS).

---

## 4. Files & Deliverables

| File                      | Responsibility                                            |
| ------------------------- | --------------------------------------------------------- |
| `js/dashboard.js`         | Data fetch, seasonal adjustment, coverage, and rendering. |
| `css/dashboard.css`       | Segment colors, hatched overlays, guideline styles.       |
| `css/main.css`            | Shared palette and layout.                                |
| `api/planned_stock/*.php` | CRUD for additional stock (boxes).                        |

---

## 5. Example Logic Pseudocode

```js
for (const product of data.products) {
  const seasonFactor = getSeasonFactor(product.id, selectedMonth);
  const weeklyDemand = computeWeeklyDemand(product.avg_weekly_sales, product.pairs_per_box, seasonFactor, AWS_UNIT);

  const segments = ['incoming', 'wml', 'gmr', 'amz'];
  let totalPairs = 0;

  for (const loc of segments) {
    totalPairs += product[`${loc}_pairs`];
    product[`weeks_${loc}`] = product[`${loc}_pairs`] / weeklyDemand;
  }

  // Add Additional (planned) segment
  const planned = plannedData[product.product_id] || [];
  const committedPairs = sum(planned.filter(p => p.scope === 'committed' && isActive(p)).map(p => p.quantity_boxes * product.pairs_per_box));
  const simPairs = sum(planned.filter(p => p.scope === 'simulation' && isActive(p)).map(p => p.quantity_boxes * product.pairs_per_box));
  totalPairs += committedPairs + simPairs;
  product.weeks_additional = (committedPairs + simPairs) / weeklyDemand;

  product.totalWeeks = totalPairs / weeklyDemand;
  product.stockoutDate = addDays(today, product.totalWeeks * 7);
}
```

---

## 6. Style Consistency

All icons from **Material Symbols**.
All color tokens sourced from `main.css`.
All animations from CSS transitions only — no JS `setInterval`.

---

---

## 7. Authentication Consistency

# Authentication Pattern Reference
**WarehouseWrangler - Standard Auth Implementation**  
**Date:** October 25, 2025

---

## 🔒 Our Authentication Pattern

This is the **standard pattern** used across all WarehouseWrangler pages. Follow this for consistency and security.

---

## 📄 HTML Pages

### **Pattern: Inline Auth Check**

Place this script in the `<head>` section of **every protected page**:

```html
<script>
    // Inline auth check
    (function() {
        const token = localStorage.getItem('ww_auth_token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }
        try {
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('Invalid token');
            const payload = JSON.parse(atob(parts[1]));
            if (payload.exp <= Math.floor(Date.now() / 1000)) {
                localStorage.removeItem('ww_auth_token');
                window.location.href = 'login.html';
                return;
            }
            // Optional: Check role if admin-only page
            // if (payload.role !== 'admin') {
            //     alert('Admin access required');
            //     window.location.href = 'index.html';
            // }
        } catch (e) {
            localStorage.removeItem('ww_auth_token');
            window.location.href = 'login.html';
        }
    })();
</script>
```

**Why Inline?**
- Runs **before** page renders
- Prevents flash of unauthorized content
- Immediate redirect if not authenticated
- No dependencies on external scripts

---

## 📜 JavaScript Files

### **Pattern: Helper Functions**

Include these in your `.js` files:

```javascript
/**
 * Get authentication token from localStorage
 */
function getToken() {
    return localStorage.getItem('ww_auth_token');
}

/**
 * Get current user data from localStorage
 */
function getCurrentUser() {
    const data = localStorage.getItem('ww_user_data');
    return data ? JSON.parse(data) : null;
}

/**
 * Setup common page elements (header, logout)
 */
document.addEventListener('DOMContentLoaded', function() {
    // Display username
    const userData = getCurrentUser();
    if (userData) {
        document.getElementById('userDisplay').textContent = `👤 ${userData.username}`;
    }

    // Setup logout button
    document.getElementById('logoutBtn').addEventListener('click', function() {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('ww_auth_token');
            localStorage.removeItem('ww_user_data');
            window.location.href = 'login.html';
        }
    });
});
```

---

## 🔌 API Calls

### **Pattern: Authorization Header**

**ALL API requests must include:**

```javascript
const response = await fetch(`${API_BASE}/your/endpoint.php`, {
    method: 'POST', // or GET, PUT, DELETE
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}` // ← CRITICAL!
    },
    body: JSON.stringify(data)
});
```

**For FormData uploads (files):**

```javascript
const formData = new FormData();
formData.append('file', selectedFile);

const response = await fetch(`${API_BASE}/upload/endpoint.php`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${getToken()}` // ← Still needed!
        // Note: No Content-Type header - browser sets it automatically for FormData
    },
    body: formData
});
```

---

## 🐘 PHP Backend

### **Pattern: Token Validation**

**Every API endpoint must start with this:**

```php
<?php
define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');

// Method check
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { // or GET, PUT, DELETE
    sendJSON(['success' => false, 'error' => 'Method not allowed'], 405);
}

try {
    // ========================================================================
    // AUTHENTICATION (Copy this block exactly!)
    // ========================================================================
    
    $authHeader = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $authHeader = $headers['Authorization'] ?? '';
    }
    
    if (empty($authHeader) || !preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        sendJSON(['success' => false, 'error' => 'No authorization token provided'], 401);
    }
    
    $token = $matches[1];
    
    // Validate token
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        sendJSON(['success' => false, 'error' => 'Invalid token format'], 401);
    }
    
    $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1])), true);
    
    // Check token expiration
    if ($payload['exp'] < time()) {
        sendJSON(['success' => false, 'error' => 'Token expired'], 401);
    }
    
    // Optional: Check role for admin-only endpoints
    // if ($payload['role'] !== 'admin') {
    //     sendJSON(['success' => false, 'error' => 'Admin access required'], 403);
    // }
    
    // Extract user ID for logging
    $userId = $payload['user_id'] ?? null;
    
    // ========================================================================
    // YOUR ENDPOINT LOGIC STARTS HERE
    // ========================================================================
    
    // ... your code ...
    
} catch (Exception $e) {
    error_log("Error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
```

---

## 🎯 Quick Checklist

### **When Creating a New Page:**

- [ ] Add inline auth check script in `<head>`
- [ ] Include `getToken()` and `getCurrentUser()` helpers in .js
- [ ] Setup header with username display
- [ ] Setup logout button handler
- [ ] Create dedicated .css file (keep HTML clean)
- [ ] Create dedicated .js file (keep HTML clean)

### **When Creating a New API Endpoint:**

- [ ] Add authentication block (copy from existing endpoint)
- [ ] Extract `$userId` for logging
- [ ] Check method (GET, POST, etc.)
- [ ] Use try-catch for error handling
- [ ] Return consistent JSON format
- [ ] Use `sendJSON()` helper for responses

### **When Making API Calls:**

- [ ] Include `Authorization: Bearer ${getToken()}` header
- [ ] Handle 401 response (redirect to login)
- [ ] Handle 403 response (show access denied)
- [ ] Use consistent error handling
- [ ] Show loading spinners during requests

---

## ⚠️ Common Mistakes to Avoid

### **❌ DON'T:**

1. **Forget Authorization header:**
   ```javascript
   // WRONG - No auth!
   fetch('/api/endpoint.php')
   ```

2. **Check auth only in JavaScript:**
   ```javascript
   // WRONG - Client-side only, can be bypassed!
   if (localStorage.getItem('token')) {
       // ... do something ...
   }
   ```

3. **Send token in query string:**
   ```javascript
   // WRONG - Insecure!
   fetch('/api/endpoint.php?token=' + token)
   ```

4. **Skip inline auth check:**
   ```html
   <!-- WRONG - Page loads before redirect -->
   <script src="auth.js"></script>
   ```

### **✅ DO:**

1. **Always include Authorization header:**
   ```javascript
   fetch('/api/endpoint.php', {
       headers: { 'Authorization': `Bearer ${getToken()}` }
   })
   ```

2. **Validate on BOTH client and server:**
   - Client: Inline check for UX
   - Server: Token validation for security

3. **Use Bearer token standard:**
   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

4. **Inline auth check in HTML:**
   ```html
   <script>
       (function() { /* auth check */ })();
   </script>
   ```

---

## 📚 Files to Reference

**Working Examples:**
- `users.html` - HTML with inline auth
- `js/users.js` - JavaScript with token handling
- `api/users/get_users.php` - PHP with token validation
- `lc-upload.html` - Recent implementation
- `api/upload/lc_file.php` - File upload with auth

---

## 🔐 Security Notes

1. **Token Storage:**
   - Stored in `localStorage` (accessible across tabs)
   - Keys: `ww_auth_token`, `ww_user_data`
   - Cleared on logout

2. **Token Expiration:**
   - Set to 24 hours
   - Checked on both client and server
   - Auto-logout on expiration

3. **HTTPS:**
   - Enforced via .htaccess
   - Required for secure token transmission

4. **Role-Based Access:**
   - `admin` - Full access (users, products, etc.)
   - `user` - Limited access (upload, view)
   - Check in inline script AND backend

---

## ✅ Testing Authentication

### **Manual Tests:**

1. **Logged-out user:**
   - Navigate to protected page → Should redirect to login

2. **Logged-in user:**
   - Navigate to protected page → Should load normally

3. **Expired token:**
   - Set `ww_auth_token` to expired JWT
   - Navigate to page → Should redirect to login

4. **Invalid token:**
   - Set `ww_auth_token` to garbage
   - Navigate to page → Should redirect to login

5. **API without token:**
   - Call API without Authorization header → 401 error

6. **Admin-only page:**
   - Login as `user`
   - Navigate to admin page → Should redirect/block

---

**This pattern is PROVEN and TESTED!** ✅  
**Use it for all new pages and endpoints.** 

**Last Updated:** October 25, 2025  
**Used In:** users, products, lc-upload modules etc.

---

## X. Final Acceptance Criteria

| Check            | Requirement                                                    |
| ---------------- | -------------------------------------------------------------- |
| ✅ Data accuracy  | Matches DB (v_product_stock_summary + planned_stock).          |
| ✅ Performance    | Sub-1s render for ≤100 products.                               |
| ✅ Visual clarity | Distinct color for each segment + hatched Additional.          |
| ✅ Responsiveness | Horizontal scroll on small screens; guidelines remain visible. |
| ✅ Accessibility  | ARIA labels on bars, thresholds, and toggles.                  |

---