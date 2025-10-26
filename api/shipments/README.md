# Shipments API Endpoints

**Base Path:** `/api/shipments/`

All endpoints require authentication via JWT token in the `Authorization` header:
```
Authorization: Bearer {token}
```

---

## Shipment Workflow

```
1. CREATE SHIPMENT (status: prepared)
   ↓
2. ADD BOXES TO SHIPMENT (can add multiple times)
   ↓
3. SEND SHIPMENT (status: sent, inventory updated)
   ↓
4. (OPTIONAL) RECALL SHIPMENT (status: recalled, inventory restored)
```

---

## 1. Create Shipment

**Endpoint:** `POST /api/shipments/create_shipment.php`

**Description:** Create a new shipment batch with status 'prepared'

**Request Body:**
```json
{
  "shipment_reference": "AMZ-2025-10-001",
  "shipment_date": "2025-10-25",
  "notes": "October shipment to FBA"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Shipment created successfully",
  "shipment_id": 1,
  "shipment": {
    "shipment_id": 1,
    "shipment_reference": "AMZ-2025-10-001",
    "shipment_date": "2025-10-25",
    "notes": "October shipment to FBA",
    "status": "prepared",
    "created_by": 1,
    "created_at": "2025-10-25 14:30:00",
    "updated_at": "2025-10-25 14:30:00"
  }
}
```

**Validations:**
- Shipment reference must be unique
- Date must be in YYYY-MM-DD format
- User must be authenticated

---

## 2. Add Boxes to Shipment

**Endpoint:** `POST /api/shipments/add_boxes_to_shipment.php`

**Description:** Add boxes from cartons to a shipment (can be called multiple times)

**Request Body:**
```json
{
  "shipment_id": 1,
  "boxes": [
    {
      "carton_id": 5,
      "product_id": 3,
      "boxes_to_send": 20
    },
    {
      "carton_id": 7,
      "product_id": 3,
      "boxes_to_send": 15
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully added 2 box entries to shipment",
  "added_count": 2,
  "warnings": []
}
```

**Validations:**
- Shipment must exist and have status 'prepared'
- Carton must have enough boxes available
- boxes_to_send must be > 0
- If carton/product already in shipment, adds to existing quantity

---

## 3. Send Shipment

**Endpoint:** `POST /api/shipments/send_shipment.php`

**Description:** Execute the shipment - updates inventory, logs movements, changes status to 'sent'

**⚠️ THIS IS THE CRITICAL ENDPOINT** - It performs all the business logic:
- Validates all boxes are still available
- Decreases `boxes_current` in `carton_contents`
- Increases `boxes_sent_to_amazon` in `carton_contents`
- Logs movements in `box_movement_log`
- Marks empty cartons as 'empty'
- Changes shipment status to 'sent'

**Request Body:**
```json
{
  "shipment_id": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Shipment AMZ-2025-10-001 sent successfully!",
  "summary": {
    "shipment_id": 1,
    "shipment_reference": "AMZ-2025-10-001",
    "total_boxes_sent": 35,
    "cartons_affected": 2,
    "products_affected": 1,
    "carton_list": ["25SVS147-5", "25SVS147-7"],
    "product_list": ["Merino Ski Socks 41-42"]
  }
}
```

**Validations:**
- Shipment must exist and have status 'prepared'
- Shipment must have contents (boxes added)
- All boxes must still be available in cartons
- Cannot send twice (status must be 'prepared')

**What Happens:**
1. Validates shipment status
2. Gets all shipment contents
3. For each carton/product:
   - Validates boxes available
   - Updates `carton_contents` (decrease current, increase sent)
   - Logs movement with negative boxes count
4. Checks for empty cartons and marks them
5. Changes shipment status to 'sent'
6. Returns summary

---

## 4. Get Shipments

**Endpoint:** `GET /api/shipments/get_shipments.php`

**Description:** List all shipments with optional filtering

**Query Parameters:**
- `status` (optional) - Filter by: `prepared`, `sent`, or `recalled`
- `from_date` (optional) - Filter from date (YYYY-MM-DD)
- `to_date` (optional) - Filter to date (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "shipments": [
    {
      "shipment_id": 1,
      "shipment_reference": "AMZ-2025-10-001",
      "shipment_date": "2025-10-25",
      "status": "sent",
      "notes": "October shipment",
      "carton_count": 2,
      "product_count": 1,
      "total_boxes": 35,
      "created_by_user": "admin",
      "created_at": "2025-10-25 14:30:00"
    }
  ],
  "summary": {
    "total_shipments": 5,
    "prepared_count": 1,
    "sent_count": 3,
    "recalled_count": 1,
    "total_boxes_sent": 156
  },
  "count": 5
}
```

**Example Usage:**
```javascript
// Get all shipments
fetch('./api/shipments/get_shipments.php', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Filter by status
fetch('./api/shipments/get_shipments.php?status=sent', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Filter by date range
fetch('./api/shipments/get_shipments.php?from_date=2025-10-01&to_date=2025-10-31', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## 5. Get Shipment Details

**Endpoint:** `GET /api/shipments/get_shipment_details.php`

**Description:** Get detailed information about a single shipment

**Query Parameters:**
- `shipment_id` (required) - Shipment ID

**Response:**
```json
{
  "success": true,
  "shipment": {
    "shipment_id": 1,
    "shipment_reference": "AMZ-2025-10-001",
    "shipment_date": "2025-10-25",
    "notes": "October shipment",
    "status": "sent",
    "created_by": 1,
    "created_by_username": "admin",
    "created_at": "2025-10-25 14:30:00",
    "updated_at": "2025-10-25 15:00:00"
  },
  "contents": [
    {
      "shipment_id": 1,
      "carton_id": 5,
      "carton_number": "25SVS147-5",
      "carton_location": "WML",
      "product_id": 3,
      "product_name": "Merino Ski Socks 41-42",
      "artikel": "SKI-41-42",
      "fnsku": "X002F2NFFV",
      "boxes_sent": 20,
      "pairs_sent": 40,
      "created_by_user": "admin",
      "created_at": "2025-10-25 14:30:00"
    }
  ],
  "summary": {
    "total_boxes": 35,
    "total_pairs": 70,
    "unique_cartons": 2,
    "unique_products": 1
  }
}
```

---

## 6. Recall Shipment

**Endpoint:** `POST /api/shipments/recall_shipment.php`

**Description:** Undo a sent shipment - returns boxes to cartons

**⚠️ IMPORTANT:** This reverses the inventory changes made by `send_shipment.php`

**Request Body:**
```json
{
  "shipment_id": 1,
  "notes": "Customer cancelled order"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Shipment AMZ-2025-10-001 recalled successfully! Boxes returned to cartons.",
  "summary": {
    "shipment_id": 1,
    "shipment_reference": "AMZ-2025-10-001",
    "total_boxes_recalled": 35,
    "cartons_affected": 2,
    "products_affected": 1,
    "carton_list": ["25SVS147-5", "25SVS147-7"],
    "product_list": ["Merino Ski Socks 41-42"]
  }
}
```

**Validations:**
- Shipment must exist and have status 'sent'
- Cannot recall twice

**What Happens:**
1. Validates shipment status
2. Gets all shipment contents
3. For each carton/product:
   - Increases `boxes_current` in `carton_contents`
   - Decreases `boxes_sent_to_amazon` in `carton_contents`
   - Logs movement with positive boxes count
   - Changes carton from 'empty' back to 'in stock' if needed
4. Changes shipment status to 'recalled'
5. Appends recall note to shipment notes
6. Returns summary

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Common Error Codes:**
- `400` - Bad request (missing/invalid parameters)
- `401` - Unauthorized (no/invalid/expired token)
- `404` - Resource not found
- `405` - Method not allowed
- `500` - Server error

---

## Complete Workflow Example

```javascript
const token = localStorage.getItem('ww_auth_token');
const API_BASE = './api/shipments';

// 1. Create shipment
const createResponse = await fetch(`${API_BASE}/create_shipment.php`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    shipment_reference: 'AMZ-2025-10-001',
    shipment_date: '2025-10-25',
    notes: 'October batch'
  })
});
const { shipment_id } = await createResponse.json();

// 2. Add boxes from multiple cartons
await fetch(`${API_BASE}/add_boxes_to_shipment.php`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    shipment_id: shipment_id,
    boxes: [
      { carton_id: 5, product_id: 3, boxes_to_send: 20 },
      { carton_id: 7, product_id: 3, boxes_to_send: 15 }
    ]
  })
});

// 3. Send shipment (executes inventory changes)
const sendResponse = await fetch(`${API_BASE}/send_shipment.php`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    shipment_id: shipment_id
  })
});
const sendResult = await sendResponse.json();
console.log(sendResult.message); // "Shipment sent successfully!"

// 4. (Optional) Recall if needed
if (needToRecall) {
  await fetch(`${API_BASE}/recall_shipment.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      shipment_id: shipment_id,
      notes: 'Customer cancelled'
    })
  });
}
```

---

## Database Tables Used

### **amazon_shipments**
- Stores shipment header information
- Fields: shipment_id, shipment_reference, shipment_date, notes, status, created_by

### **shipment_contents**
- Stores which boxes from which cartons are in the shipment
- Fields: shipment_content_id, shipment_id, carton_id, product_id, boxes_sent

### **box_movement_log**
- Audit trail of all box movements
- Records both 'sent_to_amazon' and 'recalled' movements
- Fields: log_id, carton_id, product_id, movement_type, boxes, shipment_id, notes, created_by

### **carton_contents** (Updated)
- boxes_current: Decreased when sent, increased when recalled
- boxes_sent_to_amazon: Increased when sent, decreased when recalled

---

## Status Flow

```
prepared → sent → recalled
   ↑         ↑         ↑
   └─────────┴─────────┘
   (Can stay in any status)
```

- **prepared**: Shipment created, boxes can be added
- **sent**: Shipment executed, inventory updated
- **recalled**: Shipment undone, boxes returned

---

**Created:** October 25, 2025  
**Version:** 1.0.0  
**Status:** ✅ Ready for Testing