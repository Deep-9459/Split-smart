# SplitSmart – Smart Bill Scanner & UPI Splitter
### The Financial Standard for Bill Settlement | Forbes-Inspired Premium PWA
**An Initiative by Deep Jhaveri**

---

## 1. Overview

**SplitSmart** is a professional-grade Progressive Web Application (PWA) designed primarily for Indian users to scan restaurant dining bills, allocate individual and shared items among diners, calculate exact liabilities with proportional taxes (CGST/SGST/IGST) and discounts, and collect peer-to-peer payments via NPCI UPI QR codes and formatted WhatsApp receipts.

SplitSmart embodies a **Forbes-inspired visual identity**:
- **Primary Color:** Deep Black (`#101010`)
- **Background:** White (`#FFFFFF`) with Dark Mode (`#0D0D0D`)
- **Editorial Accent:** Rich Crimson Red (`#C62828`)
- **Typography:** Premium Serif (`Playfair Display`, `Georgia`) for major headlines; crisp sans-serif (`Inter`) for financial tabular data
- **Philosophy:** Strict financial accuracy, thin 1px borders, generous white space, and zero rounding discrepancies.

---

## 2. Key Architecture & Features

### A. Strict Integer Paise Financial Engine (`js/calculation.js`)
- All calculations are performed in **integer paise** ($1\text{ INR} = 100\text{ Paise}$) to prevent floating-point inaccuracies.
- **Proportionate Distribution:** Discounts, CGST, SGST, IGST, Service Charges, and Tips are distributed proportionally based on each diner's taxable subtotal.
- **Zero-Discrepancy Guarantee:** Uses the **Hamilton / Hare-Niemeyer Largest Remainder Algorithm** so that the sum of all participant liabilities *strictly equals the verified bill total down to 0 paise*.
- Optional **Round to Nearest ₹1.00** mode with reconciled integer distribution.

### B. Hybrid Bill Scanner & Indian Bill Parser (`js/ocr.js` & `js/camera.js`)
- **Mobile Camera Stream:** Real-time camera viewfinder with receipt framing guides, torch/flashlight toggle, lens switcher, and shutter.
- **Multi-Capture Tray:** Capture long receipt rolls in multiple consecutive photos.
- **Image & PDF Ingestion:** Drag-and-drop or upload JPG, PNG, WEBP, and PDF bills.
- **Canvas Image Pre-processing:** High-contrast grayscale and Otsu threshold binarization for thermal restaurant receipts.
- **Heuristic Parser for Indian Bills:**
  - Extracts Restaurant Name, GSTIN (e.g. `27AAAAA0000A1Z5`), Date, Invoice Number.
  - Detects Line items with quantity, unit rates, and totals.
  - Detects Subtotal, Discounts, CGST (2.5%), SGST (2.5%), IGST, Service Charge (5-10%), Tips, and Round-off.
- **Editable Verification Screen:** Financial spreadsheet table to edit, add, or delete items, with confidence rating pills (High / Review / Low) and mathematical discrepancy alerts with 1-click auto-reconciliation.
- **Pre-loaded Realistic Sample Bills:**
  1. *The Bombay Canteen* (Mumbai Fine Dining • ₹3,767.50 • 10% Service Charge + 5% GST + Corporate Discount)
  2. *Toit Brewpub* (Bengaluru Microbrewery • ₹4,150.14 • Food + Beers • 15% Happy Hour Disc + 7.5% Service Charge)
  3. *Haldiram's Express* (Delhi Quick Service • ₹1,265.26 • Sweets & Snacks • Pure 5% GST)

### C. Splitting Engine (`js/app.js`)
- **Mode A (Equal Split):** Entire bill divided equally with custom contribution adjustments and remainder distribution.
- **Mode B (Item-wise Split):** Allocate dishes individually or share among multiple diners by quantity or percentage.
- **Mode C (Combined Split):** Assign individual drinks/mains, while common dishes (breads, water, starters) are automatically divided equally.
- **Participant Groups:** Save and load frequent dining groups (e.g., *Office Lunch Squad*, *Flatmates*).

### D. NPCI Compliant UPI QR Generator (`js/upi.js` & `js/qr-generator.js`)
- **Mandatory Beneficiary Confirmation Guard:** Prompts a prominent verification dialog confirming `"PAYMENT WILL BE RECEIVED ON: [Name] - [UPI ID]"` before any QR or payment link is rendered.
- **100% Offline QR Engine:** Self-contained, zero-dependency client-side QR generator rendering crisp canvas matrices.
- **NPCI URI Standard:** `upi://pay?pa={upi_id}&pn={name}&am={amount_2_decimals}&cu=INR&tn={note}`
- **Display Session Countdown Timer:** 2m, 5m, 10m, 15m countdown options with clear regulatory disclaimers.
- **One-Click Actions:**
  - Open in UPI App (Google Pay, PhonePe, Paytm, BHIM)
  - Copy UPI Payment Link
  - Download High-Resolution QR PNG Image
  - Mark Diner as Paid / Pending toggle

### E. WhatsApp & Native Sharing (`js/share.js`)
- Formatted financial receipt markdown for WhatsApp with diner name, restaurant details, itemized breakdown, taxes, net payable, and direct tap-to-pay UPI link.
- Web Share API (`navigator.share`) for native iOS/Android sharing sheets.
- Consolidated group settlement report for group chats.

### F. Persistent Local Storage (`js/db.js`)
- **IndexedDB (`SplitSmartDB`):** Stores past bills, calculation logs, UPI profiles, and frequent dining groups.
- Complete export and import of application data via JSON backup.
- Factory reset option.

### G. Automated Quality Control Test Suite (`js/tests.js`)
- Built-in runner testing all 14 points:
  1. Integer paise mathematical reconciliation (zero discrepancy invariant)
  2. Multiple items with proportional CGST, SGST, and discount
  3. Shared item splitting by percentage
  4. Equal split on non-divisible paise (Hamilton distribution)
  5. Combined splitting (individual + common auto-divided)
  6. Round-to-nearest-rupee reconciled integer invariant
  7. NPCI compliant UPI URI generator
  8. UPI VPA format regex validation
  9. Indian restaurant bill heuristics parser
  10. Erroneous/tampered OCR grand total discrepancy detection
  11. OCR confidence scoring & garbage line elimination
  12. WhatsApp formatted financial receipt generator
  13. 100% offline client-side QR matrix generator
  14. IndexedDB local persistence & transaction lifecycle

---

## 3. How to Run Locally

Because SplitSmart is a Progressive Web Application with Service Worker and Camera access, it should be served over HTTP/HTTPS (browsers restrict Camera API and Service Workers on raw `file:///` URLs):

### Option A: Using Python (Recommended)
```bash
python -m http.server 8000
```
Then open your browser at:
`http://localhost:8000`

### Option B: Using Node / npx
```bash
npx serve .
```

### Option C: Using Built-in PowerShell Server (Zero Dependencies on Windows)
```powershell
powershell -ExecutionPolicy Bypass -File .\run-server.ps1
```
This runs the zero-dependency local HTTP server on port 8080 and automatically opens `http://localhost:8080` in your default browser.

---

## 4. How to Install on Mobile Devices (PWA)

### On Android (Chrome / Brave / Edge)
1. Open the hosted or local URL in Chrome on your Android device.
2. An **"Install SplitSmart"** prompt or banner will automatically appear at the bottom.
3. Tap **"Install"** (or open the browser menu `⋮` and select **"Add to Home screen"** / **"Install app"**).
4. SplitSmart will install as a standalone native-feeling application with its own launcher icon, running full-screen without URL bars.

### On iPhone & iPad (Safari)
1. Open the URL in Safari on iOS.
2. Tap the **Share** button (box with an upward arrow) in the Safari toolbar.
3. Scroll down and tap **"Add to Home Screen"**.
4. Confirm by tapping **"Add"** in the top-right corner.
5. The SplitSmart icon will appear on your iOS home screen, launching in standalone mode with iOS safe-area notch support.

---

## 5. Security & Privacy Standard

- **Strict Local-First Guarantee:** Bills, line items, and diner calculations remain exclusively on your device.
- **Zero Banking Credential Storage:** SplitSmart never asks for or stores UPI PINs, netbanking passwords, or OTPs.
- **Optional AI Assistance:** If enabled, explicit user consent is required before any extracted text is transmitted.

---
*SplitSmart — An Initiative by Deep Jhaveri.*
