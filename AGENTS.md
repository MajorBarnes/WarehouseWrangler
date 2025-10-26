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

| Element | Rule/Implementation |
| :---- | :---- |
| **Table Display** | Use **Subtle Separator** for thin, high-clarity **zebra-striping** (alternating row backgrounds) to aid horizontal tracking. |
| **Data Scrolling** | Table headers for long data lists (e.g., cartons or upload\_history) must be **sticky** (fixed position). |
| **Form Validation** | Implement clear, visual **real-time feedback** (green/red borders and icons) on all form fields, especially the LC Upload preview. |
| **Critical Actions** | Actions like **"Send to AMZ"** or **"Recall"** must be preceded by a **confirmation modal** with a warning message using the **Danger** color. |

## 7. Actions — Icon-Only with Tooltips
- Replace text buttons with icon-only controls; keep accessibility via ARIA and native tooltips.
- **Do not use inline event handlers** (no `onclick=""`, `onchange=""`, etc.). Use **data-attributes + event delegation** from JS.
