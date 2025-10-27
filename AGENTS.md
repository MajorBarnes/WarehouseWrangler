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

## 7. Final Acceptance Criteria

| Check            | Requirement                                                    |
| ---------------- | -------------------------------------------------------------- |
| ✅ Data accuracy  | Matches DB (v_product_stock_summary + planned_stock).          |
| ✅ Performance    | Sub-1s render for ≤100 products.                               |
| ✅ Visual clarity | Distinct color for each segment + hatched Additional.          |
| ✅ Responsiveness | Horizontal scroll on small screens; guidelines remain visible. |
| ✅ Accessibility  | ARIA labels on bars, thresholds, and toggles.                  |

---