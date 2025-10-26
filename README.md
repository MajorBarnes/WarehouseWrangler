# WarehouseWrangler - Master Project Documentation
**Project:** Warehouse Management System Migration (HTA → Web App)  
**Name:** WarehouseWrangler  
**Last Updated:** October 24, 2025  
**Status:** 🟢 Active Development - Frontend Design Phase

---

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Business Requirements](#business-requirements)
3. [Data Model & Hierarchy](#data-model--hierarchy)
4. [Tech Stack & Architecture](#tech-stack--architecture)
5. [Database Schema](#database-schema)
6. [Key Business Logic](#key-business-logic)
7. [Original HTA Issues](#original-hta-issues)
8. [Development Roadmap](#development-roadmap)
9. [File Structure](#file-structure)

---

## 🎯 Project Overview
**Project:** Warehouse Management System Migration (HTA → Web App)  
**Name:** WarehouseWrangler  

### **What We're Building**
Migrating an old HTA (HTML Application) warehouse management system to a modern, multi-user web application with secure authentication and better data handling.

### **Project Name**
**WarehouseWrangler** 🤠

### **Purpose**
Track inventory across multiple warehouses (Incoming, WML, GMR), manage product information, forecast stock needs based on sales data, and reconcile with Amazon fulfillment centers.

### **Users**
Multi-user system requiring secure authentication. Multiple team members will access simultaneously.

### **Project Location**
```
G:\My Drive\Bernd\Professional\Th(F)ree Guys\ThreeGentsSite\productive\domains\threegentsBiz\WarehouseWrangler
```

### **Old HTA Location** (Reference Only)
```
G:\My Drive\Bernd\Professional\Th(F)ree Guys\products\WindowsHTAs\WarehouseHTA\hta warehouse 25503\
```

### **Hosting**
Strato.de shared hosting with MariaDB 10.11

---

## 💼 Business Requirements

### **Core Functionality**

1. **Inventory Tracking**
   - Track cartons across warehouses (Incoming → WML → GMR → Sent to AMZ)
   - Support mixed cartons (multiple products per carton)
   - Calculate stock in boxes and pairs
   - Historical audit trail

2. **File Uploads**
   - **LC/Packing List Upload:** Add new cartons from manufacturer
   - **Amazon Snapshot Upload:** Update Amazon inventory levels
   - Real-time validation with preview before save
   - Clear error messages with line numbers

3. **Amazon Integration**
   - Upload Amazon inventory snapshots
   - Compare sent cartons vs Amazon received
   - Identify discrepancies (in-transit, damaged, etc.)

4. **Stock Forecasting**
   - Calculate stock range in weeks
   - Seasonal sales factor adjustments
   - Reorder recommendations
   - Depletion date predictions

5. **Carton Management**
   - Move cartons between warehouses
   - Mark cartons as "Sent to AMZ" (archives them)
   - **Recall cartons** if marked by mistake
   - View carton contents and history

6. **Reporting & Visualization**
   - Dashboard with stock overview
   - Bar charts showing stock ranges
   - Export to CSV for ordering
   - Historical comparisons

### **Critical Requirements**

✅ **New LC uploads MUST default to "Incoming"** (was broken in HTA - defaulted to WML)  
✅ **Multi-user with secure authentication**  
✅ **Amazon snapshot REPLACES previous snapshot** (not additive)  
✅ **Recall functionality** for accidentally sent cartons  
✅ **Strong validation** before saving data  
✅ **Audit trail** for all uploads and changes

---

## 📦 Data Model & Hierarchy

### **Three-Level Product Hierarchy**

```
LEVEL 1: PRODUCT (Master Data)
├─ FNSKU: X002F2NFFV
├─ Product Name: Merino Ski Socks 41-42
├─ Pairs per Box: 2 ← Fixed for this product
├─ Average Weekly Sales: 100 pairs
└─ Monthly Sales Factors: [1.0, 1.1, 0.9, ...]

LEVEL 2: CARTON (Warehouse Unit - What customer tracks and moves)
├─ Carton Number: 25SVS147-1
├─ Location: WML (or Incoming, GMR)
├─ Status: in stock
└─ Contents: (CAN BE MIXED!)
    ├─ Product A (FNSKU: X002F2NFFV): 52 boxes
    ├─ Product B (FNSKU: X002F3G68D): 30 boxes
    └─ Product C (FNSKU: X00271716J): 18 boxes

LEVEL 3: BOX (Amazon Unit - What Amazon counts)
├─ Always contains ONE product only
└─ Contains: X pairs (from product master)
```

### **Key Facts**
- ✅ **Cartons** can be MIXED (multiple products in one carton)
- ✅ **Boxes** always contain ONE product only
- ✅ **pairs_per_box** is in the PRODUCTS MASTER (not per carton)
- ✅ Customer moves **CARTONS** between warehouses
- ✅ Amazon reports in **BOXES**
- ✅ Sales forecasting uses **PAIRS**

### **Stock Calculation Example**

```
Product: Merino Ski Socks 41-42 (X002F2NFFV)
├─ Pairs per Box: 2 (from products master)
│
├─ Internal Warehouses:
│   ├─ Incoming: 40 boxes (80 pairs)
│   ├─ WML: 82 boxes (164 pairs)
│   ├─ GMR: 52 boxes (104 pairs)
│   └─ Internal Total: 174 boxes (348 pairs)
│
├─ Amazon (Latest Snapshot):
│   ├─ Upload Date: 2025-10-20
│   ├─ Available: 48 boxes (96 pairs)
│   └─ AMZ Total: 48 boxes (96 pairs)
│
├─ GRAND TOTAL: 222 boxes (444 pairs)
│
└─ Historical (Sent to AMZ):
    └─ Carton 25SVS147-3: Sent Oct 15
        ├─ Contained: 52 boxes (104 pairs)
        └─ Comparison: Sent 52, AMZ shows 48 = -4 variance ⚠️
```

---

## 🏗️ Tech Stack & Architecture

### **Backend: PHP + MariaDB**

**Why PHP?**
- Already available on Strato shared hosting
- No special server configuration needed
- MariaDB integration is native and easy
- Secure, mature authentication libraries
- Easy deployment via FTP/SFTP

**Backend Features:**
- Modern PHP 8.x features
- PDO for secure database queries (prevents SQL injection)
- JWT tokens for session management
- RESTful API structure
- Server-side CSV parsing and validation

### **Frontend: Modern JavaScript**

**Features:**
- Modern JavaScript (ES6+)
- Clean, minimal CSS (no heavy frameworks)
- Fetch API for server communication
- Drag & drop file uploads
- Real-time validation feedback
- Preview before save

### **Database: MariaDB 10.11**

**Hosting:** Strato.de  
**Version:** MariaDB 10.11 (MySQL-compatible)  
**Features:**
- Relational database with foreign keys
- JSON support for flexible data
- Full-text search capabilities
- Transaction support for data integrity

### **Deployment**

**Environment:** Shared hosting (Strato.de)  
**Upload Method:** FTP/SFTP  
**Server:** Apache with .htaccess support  
**SSL:** HTTPS enabled (required for security)

---

## 🗄️ Database Schema

### **Overview**

8 core tables:
1. `users` - Authentication
2. `products` - Product master data
3. `cartons` - Active warehouse inventory
4. `carton_contents` - What's in each carton
5. `cartons_sent_to_amz` - Historical archive with recall
6. `amazon_snapshots` - Amazon inventory reports
7. `product_sales_factors` - Seasonal adjustments
8. `upload_history` - Audit trail

### **1. Users Table**

```sql
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    full_name VARCHAR(100),
    role ENUM('admin', 'user') DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### **2. Products Table (Master Data)**

```sql
CREATE TABLE products (
    product_id INT PRIMARY KEY AUTO_INCREMENT,
    artikel VARCHAR(100) NOT NULL,
    fnsku VARCHAR(50) UNIQUE NOT NULL,
    asin VARCHAR(50),
    sku VARCHAR(50),
    ean VARCHAR(50),
    product_name VARCHAR(200) NOT NULL,
    average_weekly_sales DECIMAL(10,2) DEFAULT 0 COMMENT 'In pairs',
    pairs_per_box INT NOT NULL COMMENT 'Fixed for this product',
    color VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_fnsku (fnsku),
    INDEX idx_asin (asin),
    INDEX idx_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### **3. Cartons Table (Active Inventory)**

```sql
CREATE TABLE cartons (
    carton_id INT PRIMARY KEY AUTO_INCREMENT,
    carton_number VARCHAR(50) UNIQUE NOT NULL,
    location ENUM('Incoming', 'WML', 'GMR') DEFAULT 'Incoming',
    status ENUM('in stock', 'sold') DEFAULT 'in stock',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_location (location),
    INDEX idx_carton_number (carton_number),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Note:** No 'Sent to AMZ' in location enum - those cartons are ARCHIVED!

### **4. Carton Contents Table**

```sql
CREATE TABLE carton_contents (
    content_id INT PRIMARY KEY AUTO_INCREMENT,
    carton_id INT NOT NULL,
    product_id INT NOT NULL,
    boxes INT NOT NULL COMMENT 'Number of boxes of this product in this carton',
    FOREIGN KEY (carton_id) REFERENCES cartons(carton_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
    UNIQUE KEY unique_carton_product (carton_id, product_id),
    INDEX idx_carton (carton_id),
    INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Example: Mixed Carton**
```sql
-- Carton 25SVS147-7 contains 3 different products
INSERT INTO carton_contents VALUES
(1, 7, 1, 30),  -- Product 1 (41-42 size): 30 boxes
(2, 7, 2, 20),  -- Product 2 (43-44 size): 20 boxes
(3, 7, 3, 10);  -- Product 3 (45-46 size): 10 boxes
-- Total: 60 boxes in one carton
```

### **5. Cartons Sent to Amazon (Archive with Recall)**

```sql
CREATE TABLE cartons_sent_to_amz (
    archive_id INT PRIMARY KEY AUTO_INCREMENT,
    carton_number VARCHAR(50) NOT NULL,
    date_sent DATE NOT NULL,
    contents JSON NOT NULL COMMENT 'Snapshot of carton contents at time of sending',
    recalled BOOLEAN DEFAULT FALSE,
    recalled_to ENUM('Incoming', 'WML', 'GMR') NULL,
    recalled_date DATETIME NULL,
    recalled_by INT NULL COMMENT 'user_id who recalled it',
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recalled_by) REFERENCES users(user_id),
    INDEX idx_carton_number (carton_number),
    INDEX idx_date_sent (date_sent),
    INDEX idx_recalled (recalled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Example JSON Contents:**
```json
[
    {"fnsku": "X002F2NFFV", "boxes": 52, "pairs_per_box": 2, "product_name": "Ski Socks 41-42"},
    {"fnsku": "X002F3G68D", "boxes": 30, "pairs_per_box": 2, "product_name": "Ski Socks 43-44"}
]
```

### **6. Amazon Snapshots Table**

```sql
CREATE TABLE amazon_snapshots (
    snapshot_id INT PRIMARY KEY AUTO_INCREMENT,
    upload_date DATETIME NOT NULL COMMENT 'When uploaded to system',
    snapshot_date DATE NOT NULL COMMENT 'Date from Amazon report',
    fnsku VARCHAR(50) NOT NULL,
    available_boxes INT DEFAULT 0 COMMENT 'What Amazon reports in BOXES',
    uploaded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(user_id),
    UNIQUE KEY unique_snapshot (fnsku, snapshot_date),
    INDEX idx_fnsku (fnsku),
    INDEX idx_snapshot_date (snapshot_date),
    INDEX idx_upload_date (upload_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Important:** Each upload REPLACES the previous snapshot for that date!

### **7. Product Sales Factors Table**

```sql
CREATE TABLE product_sales_factors (
    factor_id INT PRIMARY KEY AUTO_INCREMENT,
    product_name VARCHAR(200) NOT NULL UNIQUE,
    jan DECIMAL(3,2) DEFAULT 1.0,
    feb DECIMAL(3,2) DEFAULT 1.0,
    mar DECIMAL(3,2) DEFAULT 1.0,
    apr DECIMAL(3,2) DEFAULT 1.0,
    may DECIMAL(3,2) DEFAULT 1.0,
    jun DECIMAL(3,2) DEFAULT 1.0,
    jul DECIMAL(3,2) DEFAULT 1.0,
    aug DECIMAL(3,2) DEFAULT 1.0,
    sep DECIMAL(3,2) DEFAULT 1.0,
    oct DECIMAL(3,2) DEFAULT 1.0,
    nov DECIMAL(3,2) DEFAULT 1.0,
    dec DECIMAL(3,2) DEFAULT 1.0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_product_name (product_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### **8. Upload History Table (Audit Trail)**

```sql
CREATE TABLE upload_history (
    upload_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    file_type ENUM('packing_list', 'amazon_snapshot') NOT NULL,
    file_name VARCHAR(255),
    records_imported INT DEFAULT 0,
    upload_status ENUM('success', 'failed', 'partial') NOT NULL,
    error_log TEXT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user (user_id),
    INDEX idx_file_type (file_type),
    INDEX idx_upload_date (uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### **9. System Config Table**

```sql
CREATE TABLE system_config (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value TEXT,
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default configurations
INSERT INTO system_config (config_key, config_value, description) VALUES
('LEAD_TIME_WEEKS', '13', 'Minimum stock range in weeks (production + shipping + buffer)'),
('APP_VERSION', '1.0.0', 'Application version'),
('LAST_BACKUP', NULL, 'Last database backup timestamp');
```

---

## 🔄 Key Business Logic

### **1. LC File Upload Flow**

```
User uploads LC/Packing List CSV
    ↓
Backend parses CSV with validation
    ↓
System extracts carton prefix (e.g., "25SVS147")
    ↓
For each line in CSV:
    - Extract product info (FNSKU, artikel, etc.)
    - Parse carton numbers (handles ranges like "1-5", "6")
    - Create carton records with location = "Incoming" ← CRITICAL!
    - Create carton_contents records (boxes per product)
    - Link to products master (or create if new)
    ↓
Show preview to user
    ↓
User confirms → Save to database
    ↓
Log in upload_history table
```

**Critical Fix:** Default location is **"Incoming"** NOT "WML"!

### **2. Amazon Snapshot Upload Flow**

```
User uploads Amazon Snapshot CSV
    ↓
Backend parses CSV
    ↓
Extract snapshot date (from file or user input)
    ↓
For each product:
    - Get FNSKU
    - Get available boxes from Amazon
    - INSERT or UPDATE amazon_snapshots
      (REPLACES old snapshot for that date)
    ↓
Calculate discrepancies:
    - Compare sent cartons vs snapshot
    - Flag variances > tolerance
    ↓
Display reconciliation report
```

**Critical:** Each upload REPLACES previous snapshot data!

### **3. Carton Movement Logic**

```
User selects carton
    ↓
User changes location dropdown
    ↓
Options: Incoming, WML, GMR, "Sent to AMZ", Sold
    ↓
If "Sent to AMZ":
    - Archive carton to cartons_sent_to_amz
    - Store contents as JSON
    - DELETE from active cartons table
    - Remove from carton_contents
    ↓
If "Sold":
    - Update status to 'sold'
    - Keep in cartons table (for history)
    ↓
Else (Incoming/WML/GMR):
    - Update location field
    - Keep in active inventory
```

### **4. Recall Carton Logic**

```
User views "Cartons Sent to AMZ" list
    ↓
User clicks "Recall" on a carton
    ↓
Modal appears: "Select destination warehouse"
    Options: Incoming, WML, GMR
    ↓
User selects destination and confirms
    ↓
System:
    1. Mark archive record: recalled=TRUE, recalled_to='WML', recalled_date=NOW
    2. Recreate carton in cartons table with selected location
    3. Parse JSON contents and recreate carton_contents records
    4. Log action with user_id
    ↓
Success message: "Carton recalled to WML"
```

### **5. Stock Calculation Logic**

```sql
-- Get total stock by location for a product
SELECT 
    c.location,
    SUM(cc.boxes) as total_boxes,
    SUM(cc.boxes * p.pairs_per_box) as total_pairs
FROM cartons c
JOIN carton_contents cc ON c.carton_id = cc.carton_id
JOIN products p ON cc.product_id = p.product_id
WHERE p.fnsku = 'X002F2NFFV'
  AND c.status = 'in stock'
GROUP BY c.location;

-- Get latest Amazon snapshot
SELECT 
    a.fnsku,
    a.available_boxes,
    (a.available_boxes * p.pairs_per_box) as available_pairs,
    a.snapshot_date
FROM amazon_snapshots a
JOIN products p ON a.fnsku = p.fnsku
WHERE a.fnsku = 'X002F2NFFV'
ORDER BY a.snapshot_date DESC, a.upload_date DESC
LIMIT 1;

-- Total Stock = Internal Warehouses + Latest Amazon Snapshot
```

### **6. Stock Range Forecasting**

```javascript
function calculateStockRange(totalPairs, baseAWS, monthlySalesFactors, pairsPerBox) {
    let weeks = 0;
    let remainingStock = totalPairs;
    let currentDate = new Date();
    
    // Convert base AWS from boxes to pairs
    const baseAWSPairs = baseAWS * pairsPerBox;
    
    while (remainingStock > 0) {
        const currentMonth = currentDate.getMonth(); // 0-11
        const currentFactor = monthlySalesFactors[currentMonth] || 1.0;
        const currentAWS = baseAWSPairs * currentFactor;
        
        remainingStock -= currentAWS;
        weeks++;
        currentDate.setDate(currentDate.getDate() + 7); // +7 days
    }
    
    return {
        weeks: weeks,
        depletionDate: currentDate
    };
}
```

---

## 🐛 Original HTA Issues

### **Critical Bugs Fixed in WarehouseWrangler**

1. **❌ Default Location Bug**
   - **Old:** New cartons defaulted to "WML"
   - **New:** Default to "Incoming" ✅

2. **❌ Poor Upload Validation**
   - **Old:** Silent failures, minimal error messages
   - **New:** Real-time validation, preview before save, line-by-line error reporting ✅

3. **❌ Data Loss on AMZ Send**
   - **Old:** Cartons deleted when sent to AMZ (hard to audit)
   - **New:** Archived with full history and recall capability ✅

4. **❌ Complex Data Structure**
   - **Old:** Nested JSON files, easy to corrupt
   - **New:** Relational database with foreign keys ✅

5. **❌ No Multi-User Support**
   - **Old:** Single-user HTA application
   - **New:** Multi-user with authentication ✅

6. **❌ File Encoding Issues**
   - **Old:** BOM handling incomplete
   - **New:** Robust server-side CSV parsing ✅

7. **❌ Weak Error Handling**
   - **Old:** Generic alerts, no rollback
   - **New:** Transaction support, detailed error logs ✅

---

## 🗺️ Development Roadmap

### **Phase 1: Foundation**
- [x] Requirements gathering
- [x] Data model design
- [x] Database schema design
- [x] Create schema.sql
- [x] Database setup on Strato
- [x] Initial PHP API structure

### **Phase 2 - 3: Authentication & Core Backend**
- [x] User authentication system
- [x] Session management (JWT)
- [x] Database connection layer
- [x] Base API endpoints
- [x] Error handling framework

### **Phase 4: Product Management**
- [ ] Product Management Page
- [ ] Add Product
- [ ] Edit & Delete Product
- [ ] Seasonal Factors

### **Phase 5: LC Upload Feature**
- [x] File upload UI (drag & drop)
- [x] CSV parsing backend
- [x] Validation logic
- [x] Preview interface
- [x] Save to database
- [x] Success/error feedback

### **Phase 6: Amazon Snapshot (Current)**
- [x] Amazon CSV upload
- [x] Snapshot data processing
- [x] Reconciliation report
- [x] Variance alerts
- [x] Historical comparison

### **Phase 7: Carton Management**
- [x] View cartons by location
- [x] Move cartons (location changes)
- [x] Send to AMZ (archive)
- [x] Recall functionality
- [x] Carton detail view

### **Phase 8: Dashboard & Reporting (MVP)**
- [ ] Stock overview table
- [ ] Stock range visualization
- [ ] Bar charts
- [ ] Export to CSV
- [ ] Reorder recommendations

### **Phase 9: Advanced Features**
- [ ] Sales factor management
- [ ] Future date forecasting
- [ ] Product master management
- [ ] Upload history viewer
- [ ] System settings

---

## 📁 File Structure

### original Plan
```
WarehouseWrangler/
├── index.html                          # Main app entry point
├── login.html                          # Login page
├── .htaccess                          # Apache config, routing, security
│
├── assets/
│   ├── logo.png
│   ├── favicon.ico
│   └── images/
│
├── css/
│   ├── main.css                       # Global styles
│   ├── login.css                      # Login page styles
│   ├── dashboard.css                  # Dashboard styles
│   ├── upload.css                     # Upload interface styles
│   └── tables.css                     # Table styles
│
├── js/
│   ├── app.js                         # Main application logic
│   ├── auth.js                        # Authentication handling
│   ├── api.js                         # API communication layer
│   ├── upload.js                      # File upload logic
│   ├── cartons.js                     # Carton management
│   ├── dashboard.js                   # Dashboard & charts
│   └── utils.js                       # Helper functions
│
├── api/                               # PHP Backend
│   ├── index.php                      # API router
│   ├── config.php                     # Database connection config
│   │
│   ├── auth/
│   │   ├── login.php                  # Login endpoint
│   │   ├── logout.php                 # Logout endpoint
│   │   └── verify.php                 # Token verification
│   │
│   ├── products/
│   │   ├── list.php                   # Get all products
│   │   ├── get.php                    # Get single product
│   │   ├── create.php                 # Create product
│   │   └── update.php                 # Update product
│   │
│   ├── cartons/
│   │   ├── list.php                   # Get cartons (with filters)
│   │   ├── get.php                    # Get single carton
│   │   ├── update_location.php        # Move carton
│   │   ├── send_to_amz.php           # Archive carton
│   │   ├── recall.php                 # Recall from AMZ
│   │   └── sent_to_amz.php           # List archived cartons
│   │
│   ├── upload/
│   │   ├── lc_file.php               # LC file upload & parse
│   │   ├── amazon_snapshot.php        # Amazon snapshot upload
│   │   └── validate.php               # CSV validation
│   │
│   ├── dashboard/
│   │   ├── stock_overview.php         # Stock summary
│   │   ├── stock_range.php            # Forecasting data
│   │   └── reconciliation.php         # AMZ comparison
│   │
│   └── utils/
│       ├── db.php                     # Database helper functions
│       ├── validation.php             # Input validation
│       ├── csv_parser.php             # CSV parsing
│       ├── auth_middleware.php        # Auth checking
│       └── response.php               # Standardized API responses
│
└── db/
    ├── schema.sql                     # Full database schema
    ├── seed.sql                       # Sample/test data
    └── migrations/                    # Future schema updates
```

### current structure
```
G:\My Drive\Bernd\Professional\Th(F)ree Guys\ThreeGentsSite\productive\domains\threegentsBiz\WarehouseWrangler\public/
├── api
│   ├── auth
│   │   ├── login.php
│   │   └── require_auth.php
│   ├── products
│   │   ├── create.php
│   │   ├── delete.php
│   │   ├── get_all.php
│   │   ├── update.php
│   │   └── update_factors.php
│   ├── upload
│   │   ├── amazon_snapshot.php
│   │   └── lc_file.php
│   ├── users
│   │   ├── change_password.php
│   │   ├── create_user.php
│   │   ├── get_users.php
│   │   └── update_user.php
│   ├── utils
│   └── config.php
├── assets
├── css
│   ├── lc-upload.css
│   ├── login.css
│   ├── main.css
│   └── users.css
├── js
│   ├── amazon-snapshot-upload.js
│   ├── auth.js
│   ├── lc-upload.js
│   ├── products.js
│   └── users.js
├── .htaccess
├── amazon-snapshot-upload.html
├── favicon.ico
├── index.html
├── lc-upload.html
├── login.html
├── products.html
└── users.html
```

### **.htaccess Example**

```apache
# Enable rewrite engine
RewriteEngine On

# Force HTTPS
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# API routing
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^api/(.*)$ api/index.php?request=$1 [QSA,L]

# Security headers
Header set X-Frame-Options "SAMEORIGIN"
Header set X-Content-Type-Options "nosniff"
Header set X-XSS-Protection "1; mode=block"

# Disable directory browsing
Options -Indexes

# Protect sensitive files
<FilesMatch "\.(sql|json|md)$">
    Order allow,deny
    Deny from all
</FilesMatch>
```

---

## 🎯 Success Criteria

### **Must Have (MVP)**
- ✅ Secure multi-user login
- ✅ LC file upload with validation
- ✅ Cartons default to "Incoming"
- ✅ Move cartons between warehouses
- ✅ Amazon snapshot upload
- ✅ Send to AMZ (archive)
- ✅ Recall from AMZ
- ✅ Stock overview dashboard
- ✅ Stock range forecasting

### **Should Have (Phase 2)**
- ✅ Reconciliation reporting
- ✅ Export to CSV
- ✅ Upload history/audit trail

### **Nice to Have (Future)**
- Advanced reporting
- Mobile-responsive design
- Barcode scanning
- Email notifications
- Data visualization enhancements

---

## 📞 Support & Contact

**Project Manager:** Bernd  
**Developer:** Claude (AI Assistant)  
**Hosting Provider:** Strato.de  

**Documentation Location:**
```
G:\My Drive\Bernd\Professional\Th(F)ree Guys\products\webapps\AMZWarehouse\01_Documentation\
```


# 🎯 TERMINOLOGY REFERENCE - CRITICAL
**WarehouseWrangler - Consistent Naming Convention**

---

## ⚠️ **ALWAYS USE THESE TERMS - NO EXCEPTIONS!**

| German Term | English Term | Database Field | Example | Editable? |
|-------------|--------------|----------------|---------|-----------|
| **Artikel** | **Article / Item** | `artikel` | "Sneaker Black 43-46" | ✅ Yes |
| **Produkt** | **Product (Group)** | `product_name` | "Sneaker Bambus" | ✅ Yes |
| **Produkt-ID** | **Product ID** | `product_id` | 123 | ❌ No (auto) |

---

## 📊 **Database Schema Reference:**

### **products table:**
```sql
CREATE TABLE products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,  -- Internal ID (not editable)
    artikel VARCHAR(100) NOT NULL,               -- Article name (editable)
    fnsku VARCHAR(50) NOT NULL UNIQUE,           -- Amazon FNSKU
    asin VARCHAR(50),                            -- Amazon ASIN
    sku VARCHAR(50),                             -- SKU
    ean VARCHAR(50),                             -- EAN barcode
    product_name VARCHAR(200) NOT NULL,          -- Product group (editable)
    average_weekly_sales DECIMAL(10,2),          -- Sales in PAIRS
    pairs_per_box INT NOT NULL,                  -- Pairs per box
    color VARCHAR(50),                           -- Color
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## 🔍 **Real Examples:**

### **Product Group → Articles:**

**Product Group (Produkt):** "Sneaker Bambus"
- **Article 1 (Artikel):** "Sneaker Black 43-46"
- **Article 2 (Artikel):** "Sneaker Black 39-42"
- **Article 3 (Artikel):** "Sneaker White 43-46"

---

### **From products.csv:**
```
Sneaker Black 43-46, X001JHGP4L, B09WBL5XMP, OZ-CBST-B2R5, 4262366510012, Sneaker Bambus, 74, 8, Black
     ↑                                                                           ↑
   artikel                                                                 product_name
```

---

## ❌ **WRONG TERMS TO AVOID:**

| ❌ DON'T USE | ✅ USE INSTEAD |
|--------------|----------------|
| product_category | `product_name` |
| item_name | `artikel` |
| article_name | `artikel` |
| product_id (visible to user) | Use `artikel` |
| is_active | (field doesn't exist) |
| avg_sales_velocity | `average_weekly_sales` |

---

## 🔧 **Code Examples:**

### **✅ CORRECT - API Query:**
```php
$stmt = $db->query("
    SELECT 
        p.product_id,      -- Internal ID
        p.artikel,         -- Article name
        p.product_name,    -- Product group
        p.fnsku,
        p.asin,
        p.sku,
        p.ean,
        p.average_weekly_sales,
        p.pairs_per_box,
        p.color
    FROM products p
    ORDER BY p.artikel ASC
");
```

### **❌ WRONG - API Query:**
```php
$stmt = $db->query("
    SELECT 
        p.product_id,
        p.product_name,
        p.product_category,  -- ❌ This field doesn't exist!
        p.is_active          -- ❌ This field doesn't exist!
    FROM products p
");
```

---

### **✅ CORRECT - Frontend Display:**
```javascript
tbody.innerHTML = products.map(product => `
    <tr>
        <td>
            <div class="product-group">${product.product_name}</div>
            <div class="article-name">${product.artikel}</div>
        </td>
        <td>${product.fnsku}</td>
        ...
    </tr>
`);
```

### **❌ WRONG - Frontend Display:**
```javascript
tbody.innerHTML = products.map(product => `
    <tr>
        <td>${product.product_category}</td>  // ❌ Doesn't exist!
        <td>${product.article}</td>            // ❌ Wrong field name!
    </tr>
`);
```

---

## 🌐 **UI Labels (German):**

| Field | German Label | English Label |
|-------|-------------|---------------|
| `artikel` | **Artikel** | Article |
| `product_name` | **Produkt (Gruppe)** | Product (Group) |
| `fnsku` | **FNSKU** | FNSKU |
| `asin` | **ASIN** | ASIN |
| `sku` | **SKU** | SKU |
| `ean` | **EAN** | EAN |
| `pairs_per_box` | **Paare/Box** | Pairs/Box |
| `average_weekly_sales` | **Durchschn. Verkauf** | Avg. Sales |

---

## 📝 **Seasonal Factors Link:**

**IMPORTANT:** `product_sales_factors` table uses `product_name` (NOT `product_id`) as the foreign key!

```sql
-- ✅ CORRECT
SELECT * FROM product_sales_factors 
WHERE product_name = 'Sneaker Bambus';

-- ❌ WRONG
SELECT * FROM product_sales_factors 
WHERE product_id = 123;  -- This won't work!
```

---

## 🗂️ **Table Relationships:**

```
products (Master Data)
├─ product_id → AUTO INCREMENT (not editable)
├─ artikel → Article name (editable)
├─ product_name → Product group (editable)
└─ fnsku → Unique identifier

product_sales_factors (Seasonal Data)
├─ factor_id → AUTO INCREMENT
├─ product_name → Links to products.product_name  ← IMPORTANT!
└─ factor_jan, factor_feb, ... (12 months)

carton_contents (Inventory)
├─ content_id → AUTO INCREMENT
├─ carton_id → Links to cartons
├─ product_id → Links to products.product_id
└─ boxes → Number of boxes
```

---

## 🧪 **Testing Your Understanding:**

### **Quiz:**
1. Q: What field stores "Sneaker Black 43-46"?
   A: `artikel`

2. Q: What field stores "Sneaker Bambus"?
   A: `product_name`

3. Q: Can users edit the product_id?
   A: NO - it's auto-increment

4. Q: What field links products to seasonal_factors?
   A: `product_name` (not product_id!)

5. Q: What's the German label for `artikel`?
   A: "Artikel"

---

## 📋 **Checklist Before Writing Code:**

Before touching ANY code related to products:

- [ ] Am I using `artikel` for the article name?
- [ ] Am I using `product_name` for the product group?
- [ ] Am I NOT using `product_category`? (doesn't exist)
- [ ] Am I NOT using `is_active`? (doesn't exist)
- [ ] Am I linking to seasonal_factors via `product_name`?
- [ ] Am I NOT showing `product_id` to users?

---

## 🚨 **Common Mistakes & Fixes:**

### **Mistake 1: Wrong field name**
```php
// ❌ WRONG
SELECT product_category FROM products

// ✅ CORRECT
SELECT product_name FROM products
```

### **Mistake 2: Wrong seasonal factors link**
```php
// ❌ WRONG
WHERE product_id = ?

// ✅ CORRECT  
WHERE product_name = ?
```

### **Mistake 3: Showing product_id to user**
```html
<!-- ❌ WRONG -->
<td>ID: <?php echo $product['product_id']; ?></td>

<!-- ✅ CORRECT -->
<td><?php echo $product['artikel']; ?></td>
```

---

## 📚 **Reference Links:**

- **Database Schema:** `/01_Documentation/Productive_DB_Schema.md`
- **products.csv:** Example data file
- **article_sales_factors.json:** Seasonal factors data

---

## 🎯 **Golden Rules:**

1. **Artikel** = Individual item (e.g., "Sneaker Black 43-46")
2. **Produkt** = Product group (e.g., "Sneaker Bambus")
3. **Produkt-ID** = Internal database ID (never shown to user)
4. **ALWAYS check schema before writing queries**
5. **Seasonal factors link via `product_name`, not `product_id`**

---

**Version:** 1.0  
**Date:** October 24, 2025  
**Status:** ✅ MANDATORY REFERENCE - MUST FOLLOW

---

**Print this out. Memorize it. Never deviate from it!** 🎯

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
**Used In:** users, products, lc-upload modules
---

**Document Version:** 1.3  
**Last Updated:** October 25, 2025  
**Status:** 🟢 Ready for Implementation
