# ⚙️ WarehouseWrangler AI Style & Logic Guide

> **Core Principle:** Code readability, modularity, and consistency with database schema and CSS layout.
> Every Codex commit must respect the data model and visual language of WarehouseWrangler.

---

## 0. Collaboration Contract

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

## Carton module integration overview as reference for each of the html/js/css groups and their api endpoints

cartons.html bootstraps the protected page by enforcing the inline JWT check before rendering, wiring the shared header/nav shell, and defining UI placeholders for the metrics cards, filter form, data table, and movement/detail modals that the script fills once data arrives.

js/cartons.js centralises token access and helper formatting, hydrates the header with the cached user, and binds refresh/filter/search events. It orchestrates data loading via authenticated calls to the cartons APIs, toggles loading/empty states, renders table rows, and drives both the carton-detail modal (get\_carton\_details.php) and the move-carton workflow (move\_carton.php).

The styling in css/cartons.css keeps the page aligned with the design system—card layout, sticky data table, responsive modal shell, and badge/button treatments all stem from this stylesheet—so the HTML structure can stay lean while retaining a consistent look and feel.

Backend endpoints under api/cartons/ all enforce the bearer token, surface the filtered list (get\_cartons.php), build per-location summaries (get\_locations\_summary.php), supply drill-down content (get\_carton\_details.php), and apply move operations inside a transaction (move\_carton.php). The frontend’s fetch helpers call these routes and map the JSON payloads straight into UI state.

## Database schema documentation 

WarehouseWrangler Database Schema Fulfilment & Shipments amazon\_shipments Tracks each outbound shipment with shipment\_id PK, human-readable shipment\_reference, date, notes, status enum, and audit fields created\_by, created\_at, updated\_at.

Indexed on reference, date, status, and creator to support lookups and reporting.

shipment\_contents Junction table linking cartons and products to shipments (shipment\_content\_id PK) with the quantity of boxes sent.

Indexed per shipment, carton, product, plus a composite (shipment\_id, carton\_id) for quick drill-down.

v\_shipment\_details / v\_shipment\_summary (views) Detail view exposes shipment metadata joined to carton/product rows and derived pairs\_sent.

Summary view aggregates carton/product counts and totals per shipment while keeping original status/notes fields.

Inventory & Movements cartons Core inventory entity (carton\_id PK) with carton number, location enum (Incoming|WML|GMR), status enum, and timestamps.

Indexed for uniqueness on carton\_number plus filters for location/status combinations.

carton\_contents Lists the products within a carton, their starting/remaining/sent box counts (content\_id PK) and supports mixed-carton tracking.

Unique composite index on (carton\_id, product\_id) plus single-column indexes for reporting.

box\_movement\_log Audits every stock movement with movement type enum, signed box quantity, optional shipment link, notes, creator, and timestamp.

Indexed by carton, product, movement type/date, shipment, and user for chronological forensics.

v\_current\_inventory (view) Consolidates carton, product, and quantitative fields (boxes, pairs, percent remaining) for up-to-date dashboard use.

v\_product\_stock\_summary (view) Product-level rollup of location totals, Amazon inventory, shipments, and coverage metrics (pairs/boxes).

Master Data & Planning products Product catalogue (product\_id PK) with identifiers (artikel, fnsku, asin, sku, ean), naming, average weekly sales, pairs-per-box, and audit timestamps.

Enforces unique fnsku; auxiliary indexes cover asin/sku/ean/name searches.

planned\_stock Stores “Additional” planned boxes per product with optional eta\_date, scope (committed|simulation), user label, activation flag, and audit timestamps.

Indexed for filtering on product and scope/ETA/active triad.

product\_sales\_factors Seasonal multipliers per month for forecasting keyed by product with a uniqueness constraint on product\_id.

External Snapshots & Uploads amazon\_snapshots Captures Amazon’s reported box counts by fnsku and snapshot date with uploader metadata.

Unique key on (fnsku, snapshot\_date) plus supporting indexes.

upload\_history Audit trail of packing list / Amazon snapshot imports recording file metadata, record counts, status, and uploader.

Indexed on user, file type, upload timestamp, and status for admin review.

Configuration & Users system\_config Key/value store for runtime settings with optional description and updated timestamp (primary key config\_key).

users Authentication table storing username, bcrypt hash, optional email/name, role enum (admin|user), activation, and audit fields.

Unique username plus indexes on username/email/role for lookups.  

Codex must align with the **`PRODUCTIVE_DB_SCHEMA`**, which provides:
## **amazon\_shipments**

Table comments: Shipments sent to Amazon \- groups of boxes from various cartons

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| shipment\_id *(Primary)* | int(11) | No |  |  |
| shipment\_reference | varchar(100) | No |  | User-friendly shipment name |
| shipment\_date | date | No |  |  |
| notes | text | Yes | *NULL* |  |
| status | enum('prepared', 'sent', 'recalled') | Yes | sent |  |
| created\_by | int(11) | Yes | *NULL* |  |
| created\_at | timestamp | Yes | current\_timestamp() |  |
| updated\_at | timestamp | Yes | current\_timestamp() |  |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | shipment\_id | 3 | A | No |  |
| idx\_shipment\_date | BTREE | No | No | shipment\_date | 3 | A | No |  |
| idx\_status | BTREE | No | No | status | 3 | A | Yes |  |
| idx\_created\_by | BTREE | No | No | created\_by | 3 | A | Yes |  |
| idx\_shipment\_reference | BTREE | No | No | shipment\_reference | 3 | A | No |  |

## **amazon\_snapshots**

Table comments: Amazon inventory snapshots \- each upload replaces previous data for that date

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| snapshot\_id *(Primary)* | int(11) | No |  |  |
| upload\_date | datetime | No |  | When uploaded to our system |
| snapshot\_date | date | No |  | Date from Amazon report |
| fnsku | varchar(50) | No |  |  |
| available\_boxes | int(11) | Yes | 0 | What Amazon reports in BOXES |
| uploaded\_by | int(11) | Yes | *NULL* |  |
| created\_at | timestamp | Yes | current\_timestamp() |  |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | snapshot\_id | 26 | A | No |  |
| unique\_snapshot | BTREE | Yes | No | fnsku | 26 | A | No |  |
|  |  |  |  | snapshot\_date | 26 | A | No |  |
| uploaded\_by | BTREE | No | No | uploaded\_by | 2 | A | Yes |  |
| idx\_fnsku | BTREE | No | No | fnsku | 26 | A | No |  |
| idx\_snapshot\_date | BTREE | No | No | snapshot\_date | 2 | A | No |  |
| idx\_upload\_date | BTREE | No | No | upload\_date | 2 | A | No |  |

## **box\_movement\_log**

Table comments: Audit trail of all box movements for complete tracking history

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| log\_id *(Primary)* | int(11) | No |  |  |
| carton\_id | int(11) | No |  |  |
| product\_id | int(11) | No |  |  |
| movement\_type | enum('received', 'sent\_to\_amazon', 'recalled', 'adjusted', 'damaged', 'sold') | No |  |  |
| boxes | int(11) | No |  | Positive \= added, Negative \= removed |
| shipment\_id | int(11) | Yes | *NULL* | Link to shipment if applicable |
| notes | text | Yes | *NULL* |  |
| created\_by | int(11) | Yes | *NULL* |  |
| created\_at | timestamp | Yes | current\_timestamp() |  |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | log\_id | 5 | A | No |  |
| idx\_carton | BTREE | No | No | carton\_id | 5 | A | No |  |
| idx\_product | BTREE | No | No | product\_id | 5 | A | No |  |
| idx\_movement\_date | BTREE | No | No | created\_at | 5 | A | Yes |  |
| idx\_movement\_type | BTREE | No | No | movement\_type | 5 | A | No |  |
| idx\_shipment | BTREE | No | No | shipment\_id | 5 | A | Yes |  |
| fk\_movement\_log\_user | BTREE | No | No | created\_by | 2 | A | Yes |  |

## **cartons**

Table comments: Active warehouse inventory \- cartons currently tracked

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| carton\_id *(Primary)* | int(11) | No |  |  |
| carton\_number | varchar(50) | No |  | e.g., 25SVS147-1 |
| location | enum('Incoming', 'WML', 'GMR') | Yes | Incoming | Warehouse location |
| status | enum('in stock', 'empty', 'archived') | Yes | in stock |  |
| created\_at | timestamp | Yes | current\_timestamp() |  |
| updated\_at | timestamp | Yes | current\_timestamp() |  |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | carton\_id | 264 | A | No |  |
| carton\_number | BTREE | Yes | No | carton\_number | 264 | A | No |  |
| idx\_location | BTREE | No | No | location | 6 | A | Yes |  |
| idx\_carton\_number | BTREE | No | No | carton\_number | 264 | A | No |  |
| idx\_status | BTREE | No | No | status | 4 | A | Yes |  |
| idx\_location\_status | BTREE | No | No | location | 6 | A | Yes |  |
|  |  |  |  | status | 10 | A | Yes |  |

## **carton\_contents**

Table comments: Contents of each carton \- supports mixed cartons with multiple products

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| content\_id *(Primary)* | int(11) | No |  |  |
| carton\_id | int(11) | No |  |  |
| product\_id | int(11) | No |  |  |
| boxes\_initial | int(11) | No |  | Number of boxes when carton arrived |
| boxes\_current | int(11) | No |  | Number of boxes currently in carton |
| boxes\_sent\_to\_amazon | int(11) | Yes | 0 | Running total of boxes sent to Amazon |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | content\_id | 272 | A | No |  |
| unique\_carton\_product | BTREE | Yes | No | carton\_id | 272 | A | No |  |
|  |  |  |  | product\_id | 272 | A | No |  |
| idx\_carton | BTREE | No | No | carton\_id | 272 | A | No |  |
| idx\_product | BTREE | No | No | product\_id | 34 | A | No |  |

## **planned\_stock**

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| id *(Primary)* | int(11) | No |  |  |
| product\_id | int(11) | No |  |  |
| quantity\_boxes | int(11) | No |  |  |
| bucket | enum('Additional') | No | Additional |  |
| eta\_date | date | Yes | *NULL* |  |
| scope | enum('committed', 'simulation') | No | committed |  |
| label | varchar(255) | Yes | *NULL* |  |
| is\_active | tinyint(1) | No | 1 |  |
| created\_at | timestamp | No | current\_timestamp() |  |
| updated\_at | timestamp | No | current\_timestamp() |  |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | id | 0 | A | No |  |
| idx\_planned\_product | BTREE | No | No | product\_id | 0 | A | No |  |
| idx\_planned\_scope\_eta\_active | BTREE | No | No | scope | 0 | A | No |  |
|  |  |  |  | eta\_date | 0 | A | Yes |  |
|  |  |  |  | is\_active | 0 | A | No |  |

## **products**

Table comments: Product master data \- catalog of all products

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| product\_id *(Primary)* | int(11) | No |  |  |
| artikel | varchar(100) | No |  | Article/Item code |
| fnsku | varchar(50) | No |  | Fulfillment Network SKU (Amazon) |
| asin | varchar(50) | Yes | *NULL* | Amazon Standard Identification Number |
| sku | varchar(50) | Yes | *NULL* | Stock Keeping Unit |
| ean | varchar(50) | Yes | *NULL* | European Article Number (barcode) |
| product\_name | varchar(200) | No |  |  |
| average\_weekly\_sales | decimal(10,2) | Yes | 0.00 | Average weekly sales in PAIRS |
| pairs\_per\_box | int(11) | No |  | Fixed number of pairs per box for this product |
| color | varchar(50) | Yes | *NULL* |  |
| created\_at | timestamp | Yes | current\_timestamp() |  |
| updated\_at | timestamp | Yes | current\_timestamp() |  |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | product\_id | 30 | A | No |  |
| fnsku | BTREE | Yes | No | fnsku | 30 | A | No |  |
| idx\_fnsku | BTREE | No | No | fnsku | 30 | A | No |  |
| idx\_asin | BTREE | No | No | asin | 30 | A | Yes |  |
| idx\_sku | BTREE | No | No | sku | 30 | A | Yes |  |
| idx\_ean | BTREE | No | No | ean | 30 | A | Yes |  |
| idx\_product\_name | BTREE | No | No | product\_name | 10 | A | No |  |

## **product\_sales\_factors**

Table comments: Seasonal sales factors for stock forecasting

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| factor\_id *(Primary)* | int(11) | No |  |  |
| product\_id | int(11) | No |  |  |
| factor\_jan | decimal(3,2) | Yes | 1.00 |  |
| factor\_feb | decimal(3,2) | Yes | 1.00 |  |
| factor\_mar | decimal(3,2) | Yes | 1.00 |  |
| factor\_apr | decimal(3,2) | Yes | 1.00 |  |
| factor\_may | decimal(3,2) | Yes | 1.00 |  |
| factor\_jun | decimal(3,2) | Yes | 1.00 |  |
| factor\_jul | decimal(3,2) | Yes | 1.00 |  |
| factor\_aug | decimal(3,2) | Yes | 1.00 |  |
| factor\_sep | decimal(3,2) | Yes | 1.00 |  |
| factor\_oct | decimal(3,2) | Yes | 1.00 |  |
| factor\_nov | decimal(3,2) | Yes | 1.00 |  |
| factor\_dec | decimal(3,2) | Yes | 1.00 |  |
| updated\_at | timestamp | Yes | current\_timestamp() |  |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | factor\_id | 30 | A | No |  |
| unique\_product\_id | BTREE | Yes | No | product\_id | 30 | A | No |  |
| idx\_product\_id | BTREE | No | No | product\_id | 30 | A | No |  |

## **shipment\_contents**

Table comments: Details of which boxes from which cartons went in each shipment

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| shipment\_content\_id *(Primary)* | int(11) | No |  |  |
| shipment\_id | int(11) | No |  |  |
| carton\_id | int(11) | No |  |  |
| product\_id | int(11) | No |  |  |
| boxes\_sent | int(11) | No |  | Quantity of boxes from this carton sent in this shipment |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | shipment\_content\_id | 3 | A | No |  |
| idx\_shipment | BTREE | No | No | shipment\_id | 3 | A | No |  |
| idx\_carton | BTREE | No | No | carton\_id | 3 | A | No |  |
| idx\_product | BTREE | No | No | product\_id | 3 | A | No |  |
| idx\_shipment\_carton | BTREE | No | No | shipment\_id | 3 | A | No |  |
|  |  |  |  | carton\_id | 3 | A | No |  |

## **system\_config**

Table comments: System configuration settings

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| config\_key *(Primary)* | varchar(50) | No |  |  |
| config\_value | text | Yes | *NULL* |  |
| description | varchar(255) | Yes | *NULL* |  |
| updated\_at | timestamp | Yes | current\_timestamp() |  |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | config\_key | 8 | A | No |  |

## **upload\_history**

Table comments: Audit trail of all file uploads

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| upload\_id *(Primary)* | int(11) | No |  |  |
| user\_id | int(11) | No |  |  |
| file\_type | enum('packing\_list', 'amazon\_snapshot') | No |  |  |
| file\_name | varchar(255) | Yes | *NULL* |  |
| records\_imported | int(11) | Yes | 0 |  |
| upload\_status | enum('success', 'failed', 'partial') | No |  |  |
| error\_log | text | Yes | *NULL* |  |
| uploaded\_at | timestamp | Yes | current\_timestamp() |  |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | upload\_id | 9 | A | No |  |
| idx\_user | BTREE | No | No | user\_id | 2 | A | No |  |
| idx\_file\_type | BTREE | No | No | file\_type | 4 | A | No |  |
| idx\_upload\_date | BTREE | No | No | uploaded\_at | 9 | A | Yes |  |
| idx\_status | BTREE | No | No | upload\_status | 2 | A | No |  |

## **users**

Table comments: User accounts for authentication and authorization

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| user\_id *(Primary)* | int(11) | No |  |  |
| username | varchar(50) | No |  |  |
| password\_hash | varchar(255) | No |  | bcrypt hashed password |
| email | varchar(100) | Yes | *NULL* |  |
| full\_name | varchar(100) | Yes | *NULL* |  |
| role | enum('admin', 'user') | Yes | user |  |
| is\_active | tinyint(1) | Yes | 1 |  |
| created\_at | timestamp | Yes | current\_timestamp() |  |
| last\_login | timestamp | Yes | *NULL* |  |

### **Indexes**

| Keyname | Type | Unique | Packed | Column | Cardinality | Collation | Null | Comment |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| PRIMARY | BTREE | Yes | No | user\_id | 2 | A | No |  |
| username | BTREE | Yes | No | username | 2 | A | No |  |
| idx\_username | BTREE | No | No | username | 2 | A | No |  |
| idx\_email | BTREE | No | No | email | 2 | A | Yes |  |
| idx\_role | BTREE | No | No | role | 2 | A | Yes |  |

# Views
## **v\_current\_inventory**

Table comments: VIEW

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| carton\_id | int(11) | No | 0 |  |
| carton\_number | varchar(50) | No |  | e.g., 25SVS147-1 |
| location | enum('Incoming', 'WML', 'GMR') | Yes | Incoming | Warehouse location |
| status | enum('in stock', 'empty', 'archived') | Yes | in stock |  |
| product\_id | int(11) | No | 0 |  |
| product\_name | varchar(200) | No |  |  |
| artikel | varchar(100) | No |  | Article/Item code |
| fnsku | varchar(50) | No |  | Fulfillment Network SKU (Amazon) |
| boxes\_initial | int(11) | No |  | Number of boxes when carton arrived |
| boxes\_current | int(11) | No |  | Number of boxes currently in carton |
| boxes\_sent\_to\_amazon | int(11) | Yes | 0 | Running total of boxes sent to Amazon |
| pairs\_current | bigint(21) | No | 0 |  |
| pairs\_initial | bigint(21) | No | 0 |  |
| pairs\_sent\_to\_amazon | bigint(21) | Yes | *NULL* |  |
| percent\_remaining | decimal(15,1) | Yes | *NULL* |  |

## **v\_product\_stock\_summary**

Table comments: VIEW

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| product\_id | int(11) | No | 0 |  |
| product\_name | varchar(200) | No |  |  |
| artikel | varchar(100) | No |  | Article/Item code |
| fnsku | varchar(50) | No |  | Fulfillment Network SKU (Amazon) |
| pairs\_per\_box | int(11) | No |  | Fixed number of pairs per box for this product |
| average\_weekly\_sales | decimal(10,2) | Yes | 0.00 | Average weekly sales in PAIRS |
| incoming\_boxes | decimal(32,0) | Yes | *NULL* |  |
| wml\_boxes | decimal(32,0) | Yes | *NULL* |  |
| gmr\_boxes | decimal(32,0) | Yes | *NULL* |  |
| total\_internal\_boxes | decimal(32,0) | Yes | *NULL* |  |
| total\_internal\_pairs | decimal(42,0) | Yes | *NULL* |  |
| total\_sent\_to\_amazon\_boxes | decimal(32,0) | Yes | *NULL* |  |
| total\_sent\_to\_amazon\_pairs | decimal(42,0) | Yes | *NULL* |  |
| amz\_boxes | int(11) | Yes | *NULL* |  |
| amz\_pairs | bigint(21) | Yes | *NULL* |  |
| total\_boxes | decimal(33,0) | Yes | *NULL* |  |
| total\_pairs | decimal(43,0) | Yes | *NULL* |  |
| carton\_count | bigint(21) | No | 0 |  |

## **v\_shipment\_details**

Table comments: VIEW

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| shipment\_id | int(11) | No | 0 |  |
| shipment\_reference | varchar(100) | No |  | User-friendly shipment name |
| shipment\_date | date | No |  |  |
| shipment\_status | enum('prepared', 'sent', 'recalled') | Yes | sent |  |
| notes | text | Yes | *NULL* |  |
| carton\_id | int(11) | No |  |  |
| carton\_number | varchar(50) | No |  | e.g., 25SVS147-1 |
| carton\_location | enum('Incoming', 'WML', 'GMR') | Yes | Incoming | Warehouse location |
| product\_id | int(11) | No |  |  |
| product\_name | varchar(200) | No |  |  |
| artikel | varchar(100) | No |  | Article/Item code |
| fnsku | varchar(50) | No |  | Fulfillment Network SKU (Amazon) |
| boxes\_sent | int(11) | No |  | Quantity of boxes from this carton sent in this shipment |
| pairs\_sent | bigint(21) | No | 0 |  |
| created\_by\_user | varchar(50) | Yes | *NULL* |  |
| created\_at | timestamp | Yes | current\_timestamp() |  |

## **v\_shipment\_summary**

Table comments: VIEW

| Column | Type | Null | Default | Comments |
| ----- | ----- | ----- | ----- | ----- |
| shipment\_id | int(11) | No | 0 |  |
| shipment\_reference | varchar(100) | No |  | User-friendly shipment name |
| shipment\_date | date | No |  |  |
| status | enum('prepared', 'sent', 'recalled') | Yes | sent |  |
| notes | text | Yes | *NULL* |  |
| carton\_count | bigint(21) | No | 0 |  |
| product\_count | bigint(21) | No | 0 |  |
| total\_boxes | decimal(32,0) | Yes | *NULL* |  |
| created\_by\_user | varchar(50) | Yes | *NULL* |  |
| created\_at | timestamp | Yes | current\_timestamp() |  |



## 3. Dashboard Logic (js/dashboard.js)

**Purpose:**
Render accurate, seasonally adjusted stock coverage per product and location, incorporating additional boxes from `planned_stock`.
Provide clear “weeks of cover” visual feedback and forward projections.

---

#### Location Coverage for dashboard

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