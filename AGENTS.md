Always follow this style guide and try to make the most elegant way to achieve this

## **⚙️ WarehouseWrangler AI Style Guide**

This guide compiles all our decisions into a set of structured rules for an AI agent to follow when implementing the UI/UX design.

## CORE PRINCIPLE
Style should always be moved to a dedicated css file
Styling within the tag is to be avoided if not absolutely necessary
Keyboard- or Text-emoticons must be replaced with appropriate embedded material design icons 
The header of each html should be consistent and link to each of the html files

### **1\. Core Identity & Philosophy**

| Property | Value |
| :---- | :---- |
| **Project Name** | WarehouseWrangler |
| **Overall Tone** | Professional, high-clarity, action-oriented, secure. |
| **Design Goal** | Maximize data readability and minimize data-entry errors. |

### **2\. Logo Rules**

| Rule Name | Description | Required Element |
| :---- | :---- | :---- |
| **Primary Logo** | The Dynamic Arrow. A thick-lined box with a thick arrow cutting through, angled up-right. | **Action**, **Movement**, **Efficiency** |
| **Logo Color** | Must use the **Primary Accent** color only. | \#0056B3 (Cobalt Blue) |
| **Scalability** | Must remain legible and bold at 16px (favicon size). | **Minimalist**, **Geometric** |

### **3\. Color Palette Definitions**

This palette is based on high-contrast requirements for data-heavy applications.

| Color Name | Hex Code | Purpose in UI |
| :---- | :---- | :---- |
| **Primary Accent** | \#0056B3 (Cobalt Blue) | Action buttons, active links, primary navigation, logo. **Trust and Action.** |
| **Neutral Base** | \#F7F7F7 (Off-White) | Main backgrounds, sidebars, large content panels. **Eye-comfort.** |
| **Text Contrast** | \#333333 (Near-Black) | Primary text, data in tables, headings. **Maximum Legibility.** |
| **Subtle Separator** | \#DDDDDD (Light Grey) | Borders, dividing lines, table separators. **Non-distracting delineation.** |

### **4\. Status & Feedback Colors (Critical)**

| Status Name | Hex Code | Usage |
| :---- | :---- | :---- |
| **Success** | \#28A745 (Green) | **In Stock** status, successful file upload, form validation pass. |
| **Warning** | \#FFC107 (Amber) | **Incoming** or **In-Transit** status, reconciliation variance alerts. |
| **Danger** | \#DC3545 (Red) | **Archive** (Sent to AMZ), severe discrepancies, failed validation/error messages. |

### **5\. Typography Rules**

The fonts prioritize legibility and clear separation between regular UI text and critical inventory data.

| Font Use | Recommended Font | Role in UI | Rationale |
| :---- | :---- | :---- | :---- |
| **UI / Prose Font** | **Inter** (or **Roboto**) | Titles, buttons, instructions, and general paragraph text. | Modern, clean sans-serif for high readability on screens. |
| **Data / Code Font** | **Inconsolata** (or **Fira Mono**) | **FNSKUs**, **Carton IDs**, **Tracking Numbers**, and other coded data. | Monospace to visually distinguish critical data and ensure perfect alignment in tables. |

### **6\. General Styling Elements**

| Element | Rule/Implementation |
| :---- | :---- |
| **Table Display** | Use **Subtle Separator** for thin, high-clarity **zebra-striping** (alternating row backgrounds) to aid horizontal tracking. |
| **Data Scrolling** | Table headers for long data lists (e.g., cartons or upload\_history) must be **sticky** (fixed position). |
| **Form Validation** | Implement clear, visual **real-time feedback** (green/red borders and icons) on all form fields, especially the LC Upload preview. |
| **Critical Actions** | Actions like **"Send to AMZ"** or **"Recall"** must be preceded by a **confirmation modal** with a warning message using the **Danger** color. |

## 7. Actions — Icon-Only with Tooltips
- Replace text buttons with icon-only controls; keep accessibility via ARIA and native tooltips.
- **Do not use inline event handlers** (no `onclick=""`, `onchange=""`, etc.). Use **data-attributes + event delegation** from JS.
