# ⚙️ WarehouseWrangler AI Style Guide

> **Core Principle:** Move *all* styling to dedicated CSS files. Avoid inline styles unless absolutely necessary. Replace ASCII icons/emoticons with **Material Symbols/Icons**.

---

## 0. Collaboration Contract

* Every PR must: (1) link to the rule(s) it implements/changes, (2) include screenshots (desktop + narrow), and (3) pass the **UI Acceptance Checklist** at the end of this file.
* Do not regress headers, navigation links, or authentication UI.

---

## 1. Core Identity

| Property        | Value                                                 |
| --------------- | ----------------------------------------------------- |
| **Project**     | WarehouseWrangler                                     |
| **Tone**        | Professional, high-clarity, action-oriented, secure   |
| **Design Goal** | Maximize data readability, minimize data-entry errors |

---

## 2. Logo Rules

* **Primary Logo:** Dynamic Arrow (thick-lined box with up-right arrow) — conveys **Action, Movement, Efficiency**.
* **Logo Color:** `#0056B3` (Primary Accent) only.
* **Must** remain legible at 16px (favicon).

---

## 3. Color System (CSS variables)

> Define once in `main.css :root`; reference everywhere via `var()`.

```css
:root {
  --accent: #0056B3;        /* Primary Accent */
  --base:   #F7F7F7;        /* Neutral Base */
  --text:   #333333;        /* Text Contrast */
  --sep:    #DDDDDD;        /* Subtle Separator */
  --success:#28A745;        /* Status: Success */
  --warn:   #FFC107;        /* Status: Warning */
  --danger: #DC3545;        /* Status: Danger */
}
```

**Usage:** Primary actions/links/logo use `--accent`; content panels on `--base`; body text `--text`; borders/row separators `--sep`.

---

## 4. Typography

* **UI/Prose:** Inter (fallback Roboto, system sans)
* **Data/Code:** Inconsolata (fallback Fira Mono)
* Use monospace for **codes/IDs** (FNSKU, ASIN, SKU, Carton IDs, Tracking numbers).

```css
body { font-family: Inter, Roboto, system-ui, -apple-system, Segoe UI, Arial, sans-serif; }
.code, .mono { font-family: Inconsolata, "Fira Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
```

---

## 5. Layout & Containers

* **Header:** Consistent across pages; links to **Dashboard, Amazon Snapshot, Cartons, LC Upload, Products, Shipments, Users, Login/Logout**.
* **App Main Container Widths**

  * Default pages: `max-width: 1200px` (centered)
  * **Data-heavy pages** (Products, Shipments, Cartons lists): `max-width: 1600px`
  * Apply a page-level class to opt‑in:

```html
<main class="app-main products-page">…</main>
```

```css
.app-main { max-width: 1200px; margin: 0 auto; padding: 1.25rem; }
.app-main.products-page, .app-main.shipments-page, .app-main.cartons-page { max-width: 1600px; }
```

* **Spacing scale:** 4px grid (4, 8, 12, 16…) — avoid arbitrary values.

---

## 6. Tables — Readability Rules

* **Zebra striping:** use `--base` tint for alternate rows; borders with `--sep`.
* **Text wrapping:** allow wrapping for long descriptions; keep code cells compact.
* **Column minimums (desktop ≥1200px)** — recommended baselines for data-heavy pages:

  * Col 1 (Group/Product): `min-width: 260px`
  * Col 2 (Artikel/Description): `min-width: 220px`
  * FNSKU/ASIN/SKU/EAN: `min-width: 140–160px`
  * Saisonalität (chips area): `min-width: 220px`
  * Actions: `min-width: 120px; text-align: right`

```css
.products-table th, .products-table td { padding: .75rem .9rem; }
@media (min-width:1200px){
  .products-table th:nth-child(1), .products-table td:nth-child(1){min-width:260px}
  .products-table th:nth-child(2), .products-table td:nth-child(2){min-width:220px}
  .products-table th:nth-child(3), .products-table td:nth-child(3){min-width:140px}
  .products-table th:nth-child(4), .products-table td:nth-child(4){min-width:140px}
  .products-table th:nth-child(5), .products-table td:nth-child(5){min-width:140px}
  .products-table th:nth-child(6), .products-table td:nth-child(6){min-width:160px}
  .products-table th:nth-child(9), .products-table td:nth-child(9){min-width:220px}
  .products-table th.actions-col, .products-table td.actions{min-width:120px;text-align:right}
}
.products-table td .code { white-space: nowrap; }
.products-table td .wrap { white-space: normal; word-break: break-word; line-height: 1.35; }
```

### 6.1 Sticky Table Headers (Required for long lists)

* Use sticky headers on scrolling list views (Products, Shipments, Cartons, Upload history).
* Keep header background opaque; add subtle shadow when stuck.

```css
.table-sticky thead th { position: sticky; top: 0; z-index: 2; background: #fff; box-shadow: 0 1px 0 var(--sep); }
.table-sticky thead th:first-child { z-index: 3; }
.table-scroll { overflow: auto; max-height: 70vh; }
```

```html
<section class="table-scroll">
  <table class="products-table table-sticky"> … </table>
</section>
```

**Performance note:** Prefer `position: sticky` over JS scroll listeners. Keep header cell heights ≤ 56px.

---

## 7. Actions — Icon-Only with Tooltips

* Replace text buttons with icon-only controls; keep accessibility via ARIA and native tooltips.

```html
<td class="actions">
  <button class="btn btn-secondary btn-icon" title="Bearbeiten" aria-label="Bearbeiten">
    <span class="material-icons-outlined" aria-hidden="true">edit</span>
  </button>
  <button class="btn btn-destructive btn-icon" title="Löschen" aria-label="Löschen">
    <span class="material-icons-outlined" aria-hidden="true">delete</span>
  </button>
</td>
```

```css
.btn-icon{padding:.45rem;width:36px;height:36px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center}
.actions .material-icons-outlined{font-size:20px}
```

* **Critical actions** (Archive/Send to AMZ/Recall) must open a confirmation modal with `--danger` accents.

---

## 8. Header & Auth Integration

* Header includes: logo, primary navigation, username, and **Logout** button.
* On **every page**, on DOM ready:

  * Read `localStorage.ww_user_data` → set `#userDisplay` text.
  * Wire `#logoutBtn` → clear `ww_auth_token` & `ww_user_data`, redirect to `login.html`.
* Never ship a page that leaves `#userDisplay` at a placeholder.

```js
(function initHeader(){
  try {
    const userStr = localStorage.getItem('ww_user_data');
    const nameEl = document.getElementById('userDisplay');
    if (userStr && nameEl){ nameEl.textContent = (JSON.parse(userStr).username)||'admin'; }
    const btn = document.getElementById('logoutBtn');
    if (btn){ btn.addEventListener('click',()=>{ localStorage.removeItem('ww_auth_token'); localStorage.removeItem('ww_user_data'); location.href='login.html'; }); }
  } catch(e){ console.error('Header init error', e); }
})();
```

---

## 9. Forms & Validation

* Real-time validation (success/warn/error) using border + icon feedback (`--success`, `--warn`, `--danger`).
* Disable submit while invalid; show helpful inline messages.

---

## 10. Accessibility

* All icon-only controls must have `aria-label`.
* Color contrast WCAG AA or better.
* Focus states visible on keyboard nav; avoid `outline: none`.

---

## 11. CSS Organization & Naming

* File split:

  * `main.css` — global reset, variables, layout, header, buttons, utilities.
  * `products.css`, `shipments.css`, `cartons.css` — page/table specifics.
* Prefer BEM-like naming: `.table__cell--code`, `.btn--danger`.
* Utilities permitted (small, composable classes): `.mt-4`, `.text-right`, `.hidden`.

---

## 12. UI Acceptance Checklist (run before every PR)

1. Header renders correctly (links + username), logout works.
2. No inline styles; all changes live in CSS files.
3. Tables: zebra, readable, column minimums respected; sticky header on long lists.
4. Actions: icon-only with tooltips; ARIA labels present.
5. Desktop (≥1280px) and narrow (≤1024px) screenshots attached.
6. No console errors; Lighthouse a11y ≥ 90 on changed pages.

---

## 13. Upcoming — Backlog for Agents

* **Sticky header** already codified above; implement on: Products, Shipments, Cartons, Upload History.
* Consider virtualized rows for 1k+ item lists.
* Compact density mode toggle (reduces padding by ~20%).
