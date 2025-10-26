# Cartons API Endpoints

**Base Path:** `/api/cartons/`

All endpoints require authentication via JWT token in the `Authorization` header:
```
Authorization: Bearer {token}
```

---

## 1. Get Cartons

**Endpoint:** `GET /api/cartons/get_cartons.php`

**Description:** Retrieve list of all cartons with optional filtering

**Query Parameters:**
- `location` (optional) - Filter by location: `Incoming`, `WML`, or `GMR`
- `status` (optional) - Filter by status: `in stock`, `empty`, or `archived`
- `search` (optional) - Search by carton number, product name, or FNSKU

**Response:**
```json
{
  "success": true,
  "cartons": [
    {
      "carton_id": 1,
      "carton_number": "25SVS147-1",
      "location": "Incoming",
      "status": "in stock",
      "created_at": "2025-10-25 10:30:00",
      "updated_at": "2025-10-25 10:30:00",
      "product_count": 2,
      "total_boxes_current": 52,
      "total_boxes_initial": 52,
      "total_boxes_sent": 0
    }
  ],
  "summary": {
    "Incoming": {
      "carton_count": 5,
      "in_stock_count": 5,
      "empty_count": 0,
      "total_boxes": 260,
      "unique_products": 8
    },
    "WML": { ... },
    "GMR": { ... }
  },
  "count": 15
}
```

**Example Usage:**
```javascript
// Get all cartons
const response = await fetch('./api/cartons/get_cartons.php', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Filter by location
const incoming = await fetch('./api/cartons/get_cartons.php?location=Incoming', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Search
const search = await fetch('./api/cartons/get_cartons.php?search=25SVS147', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## 2. Get Carton Details

**Endpoint:** `GET /api/cartons/get_carton_details.php`

**Description:** Get detailed information about a single carton including contents and history

**Query Parameters:**
- `carton_id` (required) - Carton ID to retrieve

**Response:**
```json
{
  "success": true,
  "carton": {
    "carton_id": 1,
    "carton_number": "25SVS147-1",
    "location": "WML",
    "status": "in stock",
    "created_at": "2025-10-25 10:30:00",
    "updated_at": "2025-10-25 14:20:00"
  },
  "contents": [
    {
      "content_id": 1,
      "carton_id": 1,
      "product_id": 5,
      "boxes_initial": 52,
      "boxes_current": 52,
      "boxes_sent_to_amazon": 0,
      "product_name": "Merino Ski Socks 41-42",
      "fnsku": "X002F2NFFV",
      "artikel": "SKI-41-42",
      "pairs_per_box": 2,
      "pairs_initial": 104,
      "pairs_current": 104,
      "pairs_sent_to_amazon": 0
    }
  ],
  "history": [
    {
      "log_id": 1,
      "movement_type": "received",
      "boxes": 52,
      "notes": "Initial LC upload",
      "created_at": "2025-10-25 10:30:00",
      "product_name": "Merino Ski Socks 41-42",
      "fnsku": "X002F2NFFV",
      "created_by_user": "admin",
      "shipment_reference": null
    }
  ],
  "totals": {
    "boxes_initial": 52,
    "boxes_current": 52,
    "boxes_sent_to_amazon": 0,
    "pairs_initial": 104,
    "pairs_current": 104,
    "pairs_sent_to_amazon": 0,
    "product_count": 1
  }
}
```

**Example Usage:**
```javascript
const details = await fetch('./api/cartons/get_carton_details.php?carton_id=1', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## 3. Move Carton

**Endpoint:** `PUT /api/cartons/move_carton.php`

**Description:** Move a carton between warehouse locations

**Request Body:**
```json
{
  "carton_id": 1,
  "location": "WML",
  "notes": "Inspected and moved to main warehouse"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Carton 25SVS147-1 moved from Incoming to WML",
  "carton": {
    "carton_id": 1,
    "carton_number": "25SVS147-1",
    "old_location": "Incoming",
    "new_location": "WML"
  }
}
```

**Valid Locations:**
- `Incoming`
- `WML`
- `GMR`

**Example Usage:**
```javascript
const result = await fetch('./api/cartons/move_carton.php', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    carton_id: 1,
    location: 'WML',
    notes: 'Inspected and approved'
  })
});
```

---

## 4. Get Locations Summary

**Endpoint:** `GET /api/cartons/get_locations_summary.php`

**Description:** Get summary statistics for all warehouse locations

**Response:**
```json
{
  "success": true,
  "summary": {
    "Incoming": {
      "location": "Incoming",
      "total_cartons": 5,
      "in_stock_cartons": 5,
      "empty_cartons": 0,
      "archived_cartons": 0,
      "unique_products": 8,
      "total_boxes_initial": 260,
      "total_boxes_current": 260,
      "total_boxes_sent": 0,
      "total_pairs_current": 520
    },
    "WML": { ... },
    "GMR": { ... }
  },
  "totals": {
    "total_cartons": 15,
    "in_stock_cartons": 13,
    "empty_cartons": 2,
    "archived_cartons": 0,
    "unique_products": 12,
    "total_boxes_current": 780,
    "total_pairs_current": 1560
  },
  "top_products": [
    {
      "product_id": 5,
      "product_name": "Merino Ski Socks 41-42",
      "fnsku": "X002F2NFFV",
      "pairs_per_box": 2,
      "total_boxes": 156,
      "total_pairs": 312,
      "carton_count": 3
    }
  ]
}
```

**Example Usage:**
```javascript
const summary = await fetch('./api/cartons/get_locations_summary.php', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

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
- `401` - No authorization token / Invalid token / Token expired
- `400` - Invalid request (missing parameters, invalid data)
- `404` - Resource not found
- `405` - Method not allowed
- `500` - Server error

---

## Notes

1. **Authentication**: All endpoints require valid JWT token
2. **Transactions**: Move carton uses database transactions for data integrity
3. **Validation**: Location values are validated against enum: `Incoming`, `WML`, `GMR`
4. **Status Values**: Carton status can be: `in stock`, `empty`, `archived`
5. **Archived Cartons**: Cannot be moved (returns error)
6. **Mixed Cartons**: Fully supported - one carton can contain multiple products

---

## Integration Example

Complete example of listing and moving cartons:

```javascript
// Get token
const token = localStorage.getItem('ww_auth_token');

// 1. Get summary of all locations
const summaryResponse = await fetch('./api/cartons/get_locations_summary.php', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const summary = await summaryResponse.json();
console.log('Total cartons:', summary.totals.total_cartons);

// 2. Get cartons in Incoming
const cartonsResponse = await fetch('./api/cartons/get_cartons.php?location=Incoming', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const cartons = await cartonsResponse.json();

// 3. Get details of first carton
if (cartons.cartons.length > 0) {
  const cartonId = cartons.cartons[0].carton_id;
  const detailsResponse = await fetch(`./api/cartons/get_carton_details.php?carton_id=${cartonId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const details = await detailsResponse.json();
  console.log('Carton contents:', details.contents);
  
  // 4. Move carton to WML
  const moveResponse = await fetch('./api/cartons/move_carton.php', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      carton_id: cartonId,
      location: 'WML',
      notes: 'Inspected and moved to main warehouse'
    })
  });
  const moveResult = await moveResponse.json();
  console.log(moveResult.message);
}
```

---

**Created:** October 25, 2025  
**Version:** 1.0.0  
**Status:** ✅ Ready for Testing
