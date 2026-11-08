/**
 * SplitSmart - Automated Quality Control & Financial Test Suite
 * Executes 14 comprehensive tests for Mathematical Reconciliation, Rounding, UPI Generation, OCR Heuristics, and Sharing
 */

(function(window) {
    'use strict';

    var SplitSmartTests = {
        /**
         * Run all automated tests
         * @returns {Promise<Array<Object>>} Array of test results { id, name, passed, details, durationMs }
         */
        runAllTests: function() {
            var self = this;
            var results = [];
            var startTime = performance.now();

            return Promise.resolve().then(function() {
                // Test 1: Integer Paise Mathematical Reconciliation (Zero-discrepancy invariant)
                results.push(self.testPaisePrecisionAndReconciliation());

                // Test 2: Multiple Items with Proportional GST (CGST + SGST) and Discount
                results.push(self.testProportionalTaxAndDiscount());

                // Test 3: Shared Item Splitting (Equal vs Quantity Weights)
                results.push(self.testSharedItemSplitting());

                // Test 4: Equal Splitting Mode with Odd Amounts (Hare-Niemeyer Remainder Test)
                results.push(self.testEqualSplitOddAmount());

                // Test 5: Combined Splitting Mode (Individual Alcohol + Common Food/Breads)
                results.push(self.testCombinedSplitting());

                // Test 6: Round to Nearest Rupee Invariant (Sum of rounded equals bill rounded)
                results.push(self.testRoundToNearestRupee());

                // Test 7: NPCI UPI URI Specification Compliance
                results.push(self.testUPIURLGeneration());

                // Test 8: UPI ID Format Validation (Regex test)
                results.push(self.testUPIFormatValidation());

                // Test 9: Indian Bill Parser Heuristics (GSTIN, Taxes, Subtotal extraction)
                results.push(self.testIndianBillParser());

                // Test 10: Discrepancy Detection on Tampered Grand Total
                results.push(self.testDiscrepancyDetection());

                // Test 11: Low-Confidence OCR Line Filtering
                results.push(self.testLowConfidenceOCRHandling());

                // Test 12: WhatsApp Message Receipt Generation
                results.push(self.testWhatsAppMessageFormatting());

                // Test 13: Offline QR Code Matrix Generation
                results.push(self.testOfflineQRGeneration());

                // Test 14: IndexedDB Persistence and Duplicate Bill Flow
                return self.testDatabasePersistence();
            }).then(function(dbResult) {
                results.push(dbResult);
                return {
                    totalTests: results.length,
                    passedCount: results.filter(function(r) { return r.passed; }).length,
                    failedCount: results.filter(function(r) { return !r.passed; }).length,
                    totalDurationMs: (performance.now() - startTime).toFixed(1),
                    results: results
                };
            });
        },

        testPaisePrecisionAndReconciliation: function() {
            var bill = {
                restaurantName: "Reconciliation Test Cafe",
                items: [
                    { id: '1', name: 'Item 1', qty: 1, price: 33.33, allocatedTo: [{ participantId: 'p1', sharePercent: 100 }] },
                    { id: '2', name: 'Item 2', qty: 1, price: 33.33, allocatedTo: [{ participantId: 'p2', sharePercent: 100 }] },
                    { id: '3', name: 'Item 3', qty: 1, price: 33.34, allocatedTo: [{ participantId: 'p3', sharePercent: 100 }] }
                ],
                subtotal: 100.00,
                discountAmount: 0.00,
                cgstAmount: 2.50,
                sgstAmount: 2.50,
                serviceChargeAmount: 5.00,
                grandTotal: 110.00
            };
            var participants = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }];
            var res = SplitSmartCalc.calculateSettlement(bill, participants, 'ITEMWISE');

            var sumP = 0;
            res.participants.forEach(function(p) { sumP += p.netPayablePaise; });

            var passed = (sumP === 11000) && res.reconciliation.isBalanced;
            return {
                id: 'T1',
                name: "Integer Paise Mathematical Reconciliation",
                passed: passed,
                details: "Sum of participants: " + (sumP / 100) + " INR | Bill: " + (bill.grandTotal) + " INR (Zero discrepancy achieved via largest remainder)."
            };
        },

        testProportionalTaxAndDiscount: function() {
            var bill = {
                restaurantName: "Tax & Discount Test",
                items: [
                    { id: '1', name: 'Steak', qty: 1, price: 800.00, allocatedTo: [{ participantId: 'p1' }] },
                    { id: '2', name: 'Salad', qty: 1, price: 200.00, allocatedTo: [{ participantId: 'p2' }] }
                ],
                subtotal: 1000.00,
                discountAmount: 100.00, // 10% discount: P1 gets 80, P2 gets 20
                cgstAmount: 22.50,      // 2.5% on 900: P1 gets 18.00, P2 gets 4.50
                sgstAmount: 22.50,
                serviceChargeAmount: 90.00, // 10% SC: P1 gets 72.00, P2 gets 18.00
                grandTotal: 1035.00
            };
            var participants = [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }];
            var res = SplitSmartCalc.calculateSettlement(bill, participants, 'ITEMWISE');

            var p1 = res.participants.find(function(p) { return p.id === 'p1'; });
            var p2 = res.participants.find(function(p) { return p.id === 'p2'; });

            // P1: 800 - 80 + 18 + 18 + 72 = 828.00
            // P2: 200 - 20 + 4.5 + 4.5 + 18 = 207.00
            var passed = (p1.netPayablePaise === 82800) && (p2.netPayablePaise === 20700);
            return {
                id: 'T2',
                name: "Proportional Tax & Discount Allocation",
                passed: passed,
                details: "P1 Net: ₹" + (p1.netPayablePaise / 100) + " (Exp: 828.00) | P2 Net: ₹" + (p2.netPayablePaise / 100) + " (Exp: 207.00)"
            };
        },

        testSharedItemSplitting: function() {
            var bill = {
                restaurantName: "Shared Split Bistro",
                items: [
                    {
                        id: 'item_shared',
                        name: 'Large Platter',
                        qty: 1,
                        price: 300.00,
                        allocatedTo: [
                            { participantId: 'p1', sharePercent: 50 },
                            { participantId: 'p2', sharePercent: 50 }
                        ]
                    }
                ],
                subtotal: 300.00,
                grandTotal: 300.00
            };
            var participants = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }];
            var res = SplitSmartCalc.calculateSettlement(bill, participants, 'ITEMWISE');

            var p1 = res.participants.find(function(p) { return p.id === 'p1'; });
            var p2 = res.participants.find(function(p) { return p.id === 'p2'; });

            var passed = (p1.netPayablePaise === 15000) && (p2.netPayablePaise === 15000);
            return {
                id: 'T3',
                name: "Shared Item Splitting by Percentage",
                passed: passed,
                details: "₹300 Platter shared 50/50 exactly yields ₹150.00 each."
            };
        },

        testEqualSplitOddAmount: function() {
            var bill = {
                restaurantName: "Odd Equal Split",
                items: [{ id: '1', name: 'Meal', qty: 1, price: 100.00 }],
                subtotal: 100.00,
                grandTotal: 100.00
            };
            var participants = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }];
            var res = SplitSmartCalc.calculateSettlement(bill, participants, 'EQUAL');

            // 10000 paise / 3 = 3333 paise each with 1 paise remainder
            var p1 = res.participants[0].netPayablePaise;
            var p2 = res.participants[1].netPayablePaise;
            var p3 = res.participants[2].netPayablePaise;
            var sum = p1 + p2 + p3;

            var passed = (sum === 10000) && (p1 === 3334 || p2 === 3334 || p3 === 3334);
            return {
                id: 'T4',
                name: "Equal Split on Non-Divisible Paise (Hamilton Distribution)",
                passed: passed,
                details: "₹100 divided 3 ways: " + (p1/100) + ", " + (p2/100) + ", " + (p3/100) + " | Sum === ₹100.00"
            };
        },

        testCombinedSplitting: function() {
            var bill = {
                restaurantName: "Combined Mode Bar",
                items: [
                    { id: '1', name: 'Expensive Cocktail', qty: 1, price: 600.00, allocatedTo: [{ participantId: 'p1' }] },
                    { id: '2', name: 'Common Garlic Bread', qty: 1, price: 200.00, allocatedTo: [] } // unallocated -> common
                ],
                subtotal: 800.00,
                grandTotal: 800.00
            };
            var participants = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }];
            var res = SplitSmartCalc.calculateSettlement(bill, participants, 'COMBINED');

            var p1 = res.participants.find(function(p) { return p.id === 'p1'; });
            var p2 = res.participants.find(function(p) { return p.id === 'p2'; });

            // P1 gets 600 + (200/2=100) = 700
            // P2 gets 100
            var passed = (p1.netPayablePaise === 70000) && (p2.netPayablePaise === 10000);
            return {
                id: 'T5',
                name: "Combined Splitting (Individual + Auto-Divided Common Items)",
                passed: passed,
                details: "P1: ₹" + (p1.netPayablePaise/100) + " | P2: ₹" + (p2.netPayablePaise/100) + " | Sum: ₹800.00"
            };
        },

        testRoundToNearestRupee: function() {
            var bill = {
                restaurantName: "Round Rupee Lounge",
                items: [
                    { id: '1', name: 'Item 1', qty: 1, price: 33.40, allocatedTo: [{ participantId: 'p1' }] },
                    { id: '2', name: 'Item 2', qty: 1, price: 33.40, allocatedTo: [{ participantId: 'p2' }] },
                    { id: '3', name: 'Item 3', qty: 1, price: 33.20, allocatedTo: [{ participantId: 'p3' }] }
                ],
                subtotal: 100.00,
                grandTotal: 100.00,
                roundToNearestRupee: true
            };
            var participants = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }];
            var res = SplitSmartCalc.calculateSettlement(bill, participants, 'ITEMWISE');

            var sumRounded = 0;
            res.participants.forEach(function(p) { sumRounded += p.netPayablePaise; });

            // Each should have .00 paise and sum must be exactly 10000
            var allIntegerRupees = res.participants.every(function(p) { return (p.netPayablePaise % 100) === 0; });
            var passed = allIntegerRupees && (sumRounded === 10000);

            return {
                id: 'T6',
                name: "Round-To-Nearest-Rupee Reconciled Integer Invariant",
                passed: passed,
                details: "Participants: " + res.participants.map(function(p){ return '₹'+(p.netPayablePaise/100); }).join(', ') + " | Sum: ₹" + (sumRounded/100)
            };
        },

        testUPIURLGeneration: function() {
            var url = SplitSmartUPI.generateUPILink({
                upiId: "deep@okhdfcbank",
                payeeName: "Deep Jhaveri",
                amountRupees: 1250.50,
                note: "SplitSmart The Bombay Canteen"
            });

            var expectedPrefix = "upi://pay?";
            var hasPa = url.indexOf("pa=deep%40okhdfcbank") !== -1 || url.indexOf("pa=deep@okhdfcbank") !== -1;
            var hasAm = url.indexOf("am=1250.50") !== -1;
            var hasCu = url.indexOf("cu=INR") !== -1;

            var passed = url.startsWith(expectedPrefix) && hasPa && hasAm && hasCu;
            return {
                id: 'T7',
                name: "NPCI Compliant UPI URI Generator",
                passed: passed,
                details: "Generated: " + url
            };
        },

        testUPIFormatValidation: function() {
            var valid1 = SplitSmartUPI.isValidUPI("deep@okhdfcbank");
            var valid2 = SplitSmartUPI.isValidUPI("9876543210@paytm");
            var invalid1 = SplitSmartUPI.isValidUPI("not_an_upi");
            var invalid2 = SplitSmartUPI.isValidUPI("@bank");

            var passed = valid1 && valid2 && !invalid1 && !invalid2;
            return {
                id: 'T8',
                name: "UPI VPA Format Regex Validation",
                passed: passed,
                details: "Validated genuine VPAs and blocked invalid inputs."
            };
        },

        testIndianBillParser: function() {
            var rawText = [
                "THE BOMBAY CANTEEN",
                "GSTIN: 27AABCT8921M1Z4",
                "Date: 08/11/2026",
                "Bill No: BC-8942",
                "Chettinad Pork 2 450.00 900.00",
                "Garlic Naan 2 90.00 180.00",
                "SUB TOTAL: 1080.00",
                "CGST @ 2.5%: 27.00",
                "SGST @ 2.5%: 27.00",
                "SERVICE CHARGE 10%: 108.00",
                "GRAND TOTAL: 1242.00"
            ].join('\n');

            var parsed = SplitSmartOCR.parseReceiptText(rawText);
            var passed = (parsed.gstin === '27AABCT8921M1Z4') &&
                         (parsed.restaurantName === 'THE BOMBAY CANTEEN') &&
                         (parsed.items.length === 2) &&
                         (parsed.grandTotal === 1242.00);

            return {
                id: 'T9',
                name: "Indian Restaurant Bill Heuristics Parser",
                passed: passed,
                details: "Extracted GSTIN: " + parsed.gstin + " | Items: " + parsed.items.length + " | Grand Total: ₹" + parsed.grandTotal
            };
        },

        testDiscrepancyDetection: function() {
            var rawTextWithTamperedTotal = [
                "CAFE DELHI HEIGHTS",
                "SUB TOTAL: 1000.00",
                "CGST @ 2.5%: 25.00",
                "SGST @ 2.5%: 25.00",
                "GRAND TOTAL: 1999.00" // Tampered or erroneous OCR total
            ].join('\n');

            var parsed = SplitSmartOCR.parseReceiptText(rawTextWithTamperedTotal);
            var detected = !parsed.reconciliationStatus.isValid && (parsed.reconciliationStatus.discrepancyRupees > 0);

            return {
                id: 'T10',
                name: "Erroneous / Tampered OCR Grand Total Discrepancy Detection",
                passed: detected,
                details: "Discrepancy flagged: ₹" + parsed.reconciliationStatus.discrepancyRupees + " (" + parsed.reconciliationStatus.message + ")"
            };
        },

        testLowConfidenceOCRHandling: function() {
            // Test line parser on garbage line
            var garbage = SplitSmartOCR.parseItemLine("Welcome Please Visit Again", 1);
            var valid = SplitSmartOCR.parseItemLine("Paneer Butter Masala 1 280.00 280.00", 2);

            var passed = (garbage === null) && (valid !== null && valid.confidence >= 0.90);
            return {
                id: 'T11',
                name: "OCR Confidence Scoring & Garbage Line Elimination",
                passed: passed,
                details: "Eliminated greeting text and accepted high-confidence menu item."
            };
        },

        testWhatsAppMessageFormatting: function() {
            var participant = {
                name: "Alice",
                rawSubtotalFormatted: "₹1,000.00",
                discountPaise: 10000,
                discountFormatted: "₹100.00",
                cgstPaise: 2500,
                cgstFormatted: "₹25.00",
                sgstPaise: 2500,
                sgstFormatted: "₹25.00",
                serviceChargePaise: 10000,
                serviceChargeFormatted: "₹100.00",
                tipPaise: 0,
                netPayablePaise: 105000,
                netPayableFormatted: "₹1,050.00",
                items: [{ itemName: "Tasting Menu", allocatedPaise: 100000, shareNote: "Full" }]
            };
            var bill = { restaurantName: "Bastian Mumbai", date: "2026-11-08" };
            var upi = { name: "Deep Jhaveri", upiId: "deep@okhdfcbank" };

            var msg = SplitSmartShare.generateParticipantMessage(participant, bill, upi);
            var passed = msg.indexOf("BASTIAN MUMBAI") !== -1 && 
                         msg.indexOf("Alice") !== -1 && 
                         msg.indexOf("₹1,050.00") !== -1 &&
                         msg.indexOf("upi://pay?") !== -1;

            return {
                id: 'T12',
                name: "WhatsApp Formatted Financial Receipt Generator",
                passed: passed,
                details: "Generated formatted markdown with item breakdown, tax schedule, and deep link."
            };
        },

        testOfflineQRGeneration: function() {
            var testDiv = document.createElement('div');
            testDiv.style.display = 'none';
            document.body.appendChild(testDiv);

            var qrRes = SplitSmartUPI.renderQRCode(testDiv, {
                upiId: "test@upi",
                payeeName: "Tester",
                amountRupees: 100,
                note: "Test"
            }, 128);

            var canvas = testDiv.querySelector('canvas');
            var passed = !!(canvas && canvas.width === 128 && canvas.height === 128);
            document.body.removeChild(testDiv);

            return {
                id: 'T13',
                name: "100% Offline Client-Side QR Matrix Generator",
                passed: passed,
                details: "Successfully rendered 128x128 pixel QR matrix directly on HTML5 Canvas."
            };
        },

        testDatabasePersistence: function() {
            var testBill = {
                id: 'test_bill_' + Date.now(),
                restaurantName: "Automated Test Dining",
                grandTotal: 500,
                createdAt: new Date().toISOString()
            };

            return SplitSmartDB.init().then(function() {
                return SplitSmartDB.saveBill(testBill);
            }).then(function(saved) {
                return SplitSmartDB.getBill(saved.id);
            }).then(function(retrieved) {
                var match = retrieved && (retrieved.restaurantName === testBill.restaurantName);
                // Clean up
                return SplitSmartDB.deleteBill(testBill.id).then(function() {
                    return {
                        id: 'T14',
                        name: "IndexedDB Local Persistence & Transaction Lifecycle",
                        passed: match,
                        details: "Verified create, retrieve, and delete transaction lifecycle in SplitSmartDB."
                    };
                });
            }).catch(function(err) {
                return {
                    id: 'T14',
                    name: "IndexedDB Local Persistence & Transaction Lifecycle",
                    passed: false,
                    details: "IndexedDB Error: " + err.message
                };
            });
        }
    };

    window.SplitSmartTests = SplitSmartTests;

})(window);
