/**
 * SplitSmart - Hybrid Bill Scanner & OCR Extractor
 * Canvas Pre-processing, Indian Restaurant Bill Heuristics, Validation & Discrepancy Reconciliation
 */

(function(window) {
    'use strict';

    var SplitSmartOCR = {
        /**
         * Pre-process an image on an offscreen HTML5 canvas to optimize OCR text contrast
         * @param {HTMLImageElement|HTMLCanvasElement} sourceImage 
         * @returns {HTMLCanvasElement}
         */
        preprocessImageForOCR: function(sourceImage) {
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');

            // Scale to standard reading width (max 1600px, min 800px)
            var targetWidth = Math.min(1600, Math.max(800, sourceImage.width || 1000));
            var scale = targetWidth / (sourceImage.width || 1000);
            var targetHeight = (sourceImage.height || 1400) * scale;

            canvas.width = targetWidth;
            canvas.height = targetHeight;

            // Draw original
            ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

            // Fetch image pixels
            var imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            var data = imgData.data;

            // Contrast enhancement factor
            var contrast = 1.35;
            var factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

            // Grayscale and high-contrast thresholding
            for (var i = 0; i < data.length; i += 4) {
                var r = data[i];
                var g = data[i + 1];
                var b = data[i + 2];

                // Luminance grayscale
                var gray = 0.299 * r + 0.587 * g + 0.114 * b;

                // Apply contrast
                gray = factor * (gray - 128) + 128;
                if (gray < 0) gray = 0;
                if (gray > 255) gray = 255;

                // Gentle binarization: boost darks (text), whiten background
                if (gray > 165) gray = 255;
                else if (gray < 75) gray = 0;

                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }

            ctx.putImageData(imgData, 0, 0);
            return canvas;
        },

        /**
         * Intelligent Parser for Indian Restaurant Invoices & Receipts
         * Extracts Restaurant Name, GSTIN, Date, Line Items, Taxes, Discounts, and Surcharges
         * 
         * @param {string} rawText OCR text output or receipt string
         * @returns {Object} Structured bill object with confidence ratings and validation report
         */
        parseReceiptText: function(rawText) {
            if (!rawText || typeof rawText !== 'string') {
                return this.createEmptyBill();
            }

            var lines = rawText.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
            var result = this.createEmptyBill();
            result.rawOcrText = rawText;

            // 1. Extract GSTIN: 15-character alphanumeric (e.g. 27AAAAA0000A1Z5)
            var gstinRegex = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/i;
            for (var i = 0; i < lines.length; i++) {
                var matchGst = lines[i].match(gstinRegex);
                if (matchGst) {
                    result.gstin = matchGst[1].toUpperCase();
                    break;
                }
            }

            // 2. Extract Date (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
            var dateRegex = /\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}|\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2})\b/;
            for (var j = 0; j < Math.min(lines.length, 12); j++) {
                var matchDate = lines[j].match(dateRegex);
                if (matchDate) {
                    result.date = matchDate[1];
                    break;
                }
            }
            if (!result.date) {
                result.date = new Date().toISOString().split('T')[0];
            }

            // 3. Extract Invoice / Bill Number
            var invRegex = /(?:Bill\s*(?:No|#)?|Inv(?:oice)?\s*(?:No|#)?|Cash\s*Memo|Check\s*#)[\s:]*([A-Za-z0-9\/\-_]+)/i;
            for (var k = 0; k < Math.min(lines.length, 12); k++) {
                var matchInv = lines[k].match(invRegex);
                if (matchInv && matchInv[1].length > 1) {
                    result.invoiceNumber = matchInv[1];
                    break;
                }
            }

            // 4. Extract Restaurant Name: Look in first 4 non-meta lines
            for (var r = 0; r < Math.min(lines.length, 5); r++) {
                var line = lines[r];
                // Exclude lines with tax invoice, gstin, phone, or dates
                if (!line.match(/gstin|tax\s*invoice|cash\s*memo|tel|phone|date|table|welcome/i) && line.length > 3) {
                    result.restaurantName = line.replace(/[^a-zA-Z0-9\s&'.,\-]/g, '').trim();
                    break;
                }
            }
            if (!result.restaurantName) result.restaurantName = "Restaurant Bill";

            // 5. Financial Summary Lines Detection (Subtotal, Taxes, Discounts, Grand Total)
            var subtotalFound = false;
            var grandTotalFound = false;

            var subtotalPattern = /(?:sub[\s\-]*total|food[\s\&]*bev|items?[\s\-]*total)[\s:]*([\d,]+\.?\d*)/i;
            var discountPattern = /(?:discount|disc|privilege|happy\s*hours?|voucher)[\s\(\)%@:\-]*([\d,]+\.?\d*)/i;
            var cgstPattern = /cgst[\s@%]*([\d\.]+)?%?[\s:]*([\d,]+\.?\d*)/i;
            var sgstPattern = /sgst[\s@%]*([\d\.]+)?%?[\s:]*([\d,]+\.?\d*)/i;
            var igstPattern = /igst[\s@%]*([\d\.]+)?%?[\s:]*([\d,]+\.?\d*)/i;
            var serviceChargePattern = /(?:service\s*charge|service\s*chg|s\.?c\.?)[\s@%]*([\d\.]+)?%?[\s:]*([\d,]+\.?\d*)/i;
            var tipPattern = /(?:tip|gratuity|staff\s*contribution)[\s:]*([\d,]+\.?\d*)/i;
            var roundOffPattern = /(?:round\s*off|rnd\s*off|rounding)[\s:]*([\-0-9,]+\.?\d*)/i;
            var grandTotalPattern = /(?:grand\s*total|net\s*payable|total\s*amount|amount\s*payable|total\s*due|bill\s*total)[\s:INR₹]*([\d,]+\.?\d*)/i;

            // 6. Line Items Extraction
            // A line item typically contains an item description, quantity, and amount
            var candidateItems = [];

            for (var idx = 0; idx < lines.length; idx++) {
                var currentLine = lines[idx];

                // Check for totals first
                var matchSub = currentLine.match(subtotalPattern);
                if (matchSub && !subtotalFound) {
                    result.subtotal = this.cleanNumber(matchSub[1]);
                    subtotalFound = true;
                    continue;
                }

                var matchDisc = currentLine.match(discountPattern);
                if (matchDisc) {
                    result.discountAmount = Math.abs(this.cleanNumber(matchDisc[1]));
                    result.discountNote = "Bill Discount";
                    continue;
                }

                var matchCgst = currentLine.match(cgstPattern);
                if (matchCgst) {
                    if (matchCgst[1]) result.cgstRate = parseFloat(matchCgst[1]);
                    result.cgstAmount = this.cleanNumber(matchCgst[2]);
                    continue;
                }

                var matchSgst = currentLine.match(sgstPattern);
                if (matchSgst) {
                    if (matchSgst[1]) result.sgstRate = parseFloat(matchSgst[1]);
                    result.sgstAmount = this.cleanNumber(matchSgst[2]);
                    continue;
                }

                var matchIgst = currentLine.match(igstPattern);
                if (matchIgst) {
                    if (matchIgst[1]) result.igstRate = parseFloat(matchIgst[1]);
                    result.igstAmount = this.cleanNumber(matchIgst[2]);
                    continue;
                }

                var matchSC = currentLine.match(serviceChargePattern);
                if (matchSC) {
                    if (matchSC[1]) result.serviceChargeRate = parseFloat(matchSC[1]);
                    result.serviceChargeAmount = this.cleanNumber(matchSC[2]);
                    continue;
                }

                var matchTip = currentLine.match(tipPattern);
                if (matchTip) {
                    result.tipAmount = this.cleanNumber(matchTip[1]);
                    continue;
                }

                var matchRnd = currentLine.match(roundOffPattern);
                if (matchRnd) {
                    result.otherChargesAmount = parseFloat(matchRnd[1]) || 0;
                    continue;
                }

                var matchGrand = currentLine.match(grandTotalPattern);
                if (matchGrand) {
                    result.grandTotal = this.cleanNumber(matchGrand[1]);
                    grandTotalFound = true;
                    continue;
                }

                // Header separators, invoice metadata, or receipt footer lines to skip
                if (currentLine.match(/^-{3,}|={3,}|item\s*name|qty\s*rate|description|thank\s*you|visit\s*again|table\s*no|server\s*:|gstin|fssai|bill\s*(?:no|#)|inv(?:oice)?\s*(?:no|#)|date[\s:]|cash\s*memo/i) ||
                    currentLine.match(gstinRegex) || currentLine.match(invRegex) || currentLine.match(dateRegex)) {
                    continue;
                }

                // Try parsing line as item: e.g. "Chettinad Pulled Pork  2  450.00  900.00" or "2 Butter Naan 180.00"
                var itemParse = this.parseItemLine(currentLine, idx);
                if (itemParse) {
                    candidateItems.push(itemParse);
                }
            }

            result.items = candidateItems;

            // 7. Validation & Reconciliation Verification
            this.reconcileExtractedBill(result);

            return result;
        },

        /**
         * Parses a single text line to identify item name, quantity, unit price, and line total
         */
        parseItemLine: function(line, lineIndex) {
            // Must contain at least one price/number with decimal or currency
            // Regex to find numbers at the end of the line
            var numberMatches = line.match(/(\d+(?:\.\d{1,2})?)/g);
            if (!numberMatches || numberMatches.length === 0) return null;

            // Filter out numbers that look like dates or phone numbers
            if (line.match(/\b\d{10}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/)) return null;

            var lastNum = parseFloat(numberMatches[numberMatches.length - 1]);
            if (isNaN(lastNum) || lastNum <= 0) return null;

            // Don't treat huge GST numbers or years as line items
            if (lastNum > 500000 || lastNum === 2026 || lastNum === 2025) return null;

            var qty = 1;
            var unitPrice = lastNum;
            var total = lastNum;

            if (numberMatches.length >= 3) {
                // e.g., "Item Name 2 450.00 900.00"
                var possibleQty = parseInt(numberMatches[numberMatches.length - 3], 10);
                var possibleUnit = parseFloat(numberMatches[numberMatches.length - 2]);
                if (possibleQty > 0 && possibleQty <= 50 && Math.abs((possibleQty * possibleUnit) - lastNum) < 1.0) {
                    qty = possibleQty;
                    unitPrice = possibleUnit;
                    total = lastNum;
                }
            } else if (numberMatches.length === 2) {
                var firstNum = parseFloat(numberMatches[0]);
                if (firstNum > 0 && firstNum <= 50 && firstNum === Math.floor(firstNum)) {
                    qty = firstNum;
                    unitPrice = lastNum / qty;
                    total = lastNum;
                }
            }

            // Extract item name by removing the numbers at the tail
            var name = line;
            numberMatches.forEach(function(num) {
                // remove exact matches from right
                var pos = name.lastIndexOf(num);
                if (pos !== -1 && pos >= name.length - num.length - 15) {
                    name = name.substring(0, pos);
                }
            });

            name = name.replace(/[^a-zA-Z0-9\s&()\-.,'/]/g, '').trim();
            if (name.length < 2) return null;

            // Confidence rating
            var confidence = 0.95;
            if (name.length < 4 || qty === 1 && total < 10) confidence = 0.70;
            if (isNaN(unitPrice) || isNaN(total)) confidence = 0.40;

            return {
                id: 'item_' + lineIndex + '_' + Date.now().toString(36),
                name: name,
                qty: qty,
                price: parseFloat(unitPrice.toFixed(2)),
                total: parseFloat(total.toFixed(2)),
                confidence: confidence
            };
        },

        /**
         * Cleans a string number (e.g. "3,640.00" -> 3640)
         */
        cleanNumber: function(str) {
            if (!str) return 0;
            var cleaned = str.replace(/[^0-9.-]/g, '');
            return parseFloat(cleaned) || 0;
        },

        /**
         * Cross-validates extracted numbers against mathematical invariants:
         * Line Item Sum - Discount + CGST + SGST + IGST + Service Charge + Tip + RoundOff === Grand Total
         */
        reconcileExtractedBill: function(bill) {
            var itemsSum = 0;
            (bill.items || []).forEach(function(item) {
                itemsSum += (item.price * (item.qty || 1));
            });

            // If subtotal wasn't explicitly extracted from text, use itemsSum
            if (!bill.subtotal || bill.subtotal === 0) {
                bill.subtotal = parseFloat(itemsSum.toFixed(2));
            }

            var expectedGrandTotal = bill.subtotal 
                - (bill.discountAmount || 0) 
                + (bill.cgstAmount || 0) 
                + (bill.sgstAmount || 0) 
                + (bill.igstAmount || 0) 
                + (bill.serviceChargeAmount || 0) 
                + (bill.tipAmount || 0) 
                + (bill.otherChargesAmount || 0);

            expectedGrandTotal = parseFloat(expectedGrandTotal.toFixed(2));

            // If grand total wasn't explicitly detected, assign expected
            if (!bill.grandTotal || bill.grandTotal === 0) {
                bill.grandTotal = expectedGrandTotal;
                bill.reconciliationStatus = {
                    isValid: true,
                    discrepancyRupees: 0,
                    message: "Grand total estimated from itemized lines and taxes."
                };
            } else {
                var discrepancy = parseFloat(Math.abs(bill.grandTotal - expectedGrandTotal).toFixed(2));
                if (discrepancy <= 0.50) {
                    bill.reconciliationStatus = {
                        isValid: true,
                        discrepancyRupees: discrepancy,
                        message: "Mathematical verification passed (within normal round-off limits)."
                    };
                } else {
                    bill.reconciliationStatus = {
                        isValid: false,
                        discrepancyRupees: discrepancy,
                        message: "Discrepancy detected: Extracted Grand Total (" + bill.grandTotal + ") differs by ₹" + discrepancy + " from calculated sum (" + expectedGrandTotal + ")."
                    };
                }
            }
        },

        /**
         * Helper to create empty bill skeleton
         */
        createEmptyBill: function() {
            return {
                id: 'bill_' + Date.now(),
                restaurantName: '',
                location: '',
                gstin: '',
                invoiceNumber: '',
                date: new Date().toISOString().split('T')[0],
                time: new Date().toTimeString().split(' ')[0].substring(0, 5),
                items: [],
                subtotal: 0,
                discountAmount: 0,
                discountNote: '',
                serviceChargeAmount: 0,
                serviceChargeRate: 0,
                cgstAmount: 0,
                cgstRate: 2.5,
                sgstAmount: 0,
                sgstRate: 2.5,
                igstAmount: 0,
                igstRate: 0,
                tipAmount: 0,
                otherChargesAmount: 0,
                grandTotal: 0,
                roundToNearestRupee: false,
                rawOcrText: '',
                reconciliationStatus: { isValid: true, discrepancyRupees: 0, message: "Ready for verification" }
            };
        }
    };

    window.SplitSmartOCR = SplitSmartOCR;

})(window);
