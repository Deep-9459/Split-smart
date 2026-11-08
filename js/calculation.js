/**
 * SplitSmart - Financial Calculation Engine
 * Strict Integer Paise (1 INR = 100 Paise) Arithmetic & Rounding Reconciliation
 * 
 * Features:
 * - Line-item level precision in integer paise
 * - Hamilton / Hare-Niemeyer Largest Remainder distribution for perfect reconciliation
 * - Strict mathematical guarantee: Sum(Participant Balances) === Bill Total (0 paise error)
 * - Proportional allocation of Discounts, CGST, SGST, IGST, Service Charge, and Tips
 * - Support for Equal Split, Item-wise Split, and Combined/Hybrid Split
 */

(function(window) {
    'use strict';

    var SplitSmartCalc = {
        /**
         * Convert Rupee float/string to Integer Paise
         * @param {number|string} rupees 
         * @returns {number} integer paise
         */
        toPaise: function(rupees) {
            if (rupees === undefined || rupees === null || isNaN(rupees)) return 0;
            var num = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
            return Math.round(num * 100);
        },

        /**
         * Convert Integer Paise to formatted Rupee string
         * @param {number} paise 
         * @param {boolean} includeSymbol 
         * @returns {string} e.g. "₹1,240.50" or "1240.50"
         */
        toRupees: function(paise, includeSymbol) {
            if (paise === undefined || paise === null || isNaN(paise)) paise = 0;
            var val = (paise / 100).toFixed(2);
            // Format with Indian Numbering System (e.g., 1,23,456.78)
            var parts = val.split('.');
            var intPart = parts[0];
            var decPart = parts[1];
            
            var isNegative = intPart.startsWith('-');
            if (isNegative) intPart = intPart.substring(1);

            var lastThree = intPart.slice(-3);
            var otherNumbers = intPart.slice(0, -3);
            if (otherNumbers !== '') {
                lastThree = ',' + lastThree;
            }
            var formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree + '.' + decPart;
            if (isNegative) formatted = '-' + formatted;

            return includeSymbol ? ('₹' + formatted) : formatted;
        },

        /**
         * Distribute a total pool of paise among participants according to weights
         * Uses Hamilton / Largest Remainder method so that the sum of parts strictly equals totalPoolPaise.
         * 
         * @param {number} totalPoolPaise Total integer paise to distribute
         * @param {Array<{id: string, weight: number}>} participantsWithWeights 
         * @returns {Object.<string, number>} Map of participant id to allocated integer paise
         */
        distributeProportionately: function(totalPoolPaise, participantsWithWeights) {
            var result = {};
            if (!participantsWithWeights || participantsWithWeights.length === 0) return result;
            if (totalPoolPaise === 0) {
                participantsWithWeights.forEach(function(p) { result[p.id] = 0; });
                return result;
            }

            var totalWeight = 0;
            participantsWithWeights.forEach(function(p) {
                totalWeight += Math.max(0, p.weight);
            });

            // If no weight or all 0, distribute equally
            if (totalWeight === 0) {
                return this.distributeEqually(totalPoolPaise, participantsWithWeights.map(function(p) { return p.id; }));
            }

            var floorAllocations = [];
            var sumFloors = 0;

            participantsWithWeights.forEach(function(p, index) {
                var exactShare = (p.weight / totalWeight) * totalPoolPaise;
                var floorShare = Math.floor(exactShare);
                var remainder = exactShare - floorShare;
                floorAllocations.push({
                    id: p.id,
                    index: index,
                    floorShare: floorShare,
                    remainder: remainder,
                    weight: p.weight
                });
                sumFloors += floorShare;
            });

            var remainingPaise = totalPoolPaise - sumFloors;

            // Sort by largest remainder descending (Hamilton / Hare-Niemeyer method)
            floorAllocations.sort(function(a, b) {
                if (b.remainder !== a.remainder) {
                    return b.remainder - a.remainder;
                }
                return a.index - b.index; // Stable sort
            });

            for (var i = 0; i < floorAllocations.length; i++) {
                var extra = (i < remainingPaise) ? 1 : 0;
                result[floorAllocations[i].id] = floorAllocations[i].floorShare + extra;
            }

            return result;
        },

        /**
         * Distribute total pool of paise equally among participant IDs with exact reconciliation
         * @param {number} totalPoolPaise 
         * @param {Array<string>} participantIds 
         * @returns {Object.<string, number>}
         */
        distributeEqually: function(totalPoolPaise, participantIds) {
            var result = {};
            if (!participantIds || participantIds.length === 0) return result;
            var n = participantIds.length;
            var floorShare = Math.floor(totalPoolPaise / n);
            var remainder = totalPoolPaise - (floorShare * n);

            participantIds.forEach(function(id, idx) {
                result[id] = floorShare + (idx < remainder ? 1 : 0);
            });
            return result;
        },

        /**
         * Main Calculation Engine: Calculates full settlement matrix
         * 
         * @param {Object} bill Data structure containing:
         *   - items: Array<{id, name, qty, price, allocatedTo: Array<{participantId, qty, sharePercent}>}>
         *   - subtotal (Rupees)
         *   - discountAmount (Rupees)
         *   - discountPercent (optional)
         *   - cgstAmount (Rupees)
         *   - sgstAmount (Rupees)
         *   - igstAmount (Rupees)
         *   - serviceChargeAmount (Rupees)
         *   - tipAmount (Rupees)
         *   - otherChargesAmount (Rupees)
         *   - grandTotal (Rupees)
         *   - roundToNearestRupee (boolean)
         * @param {Array<Object>} participants Array<{id, name, isExcluded, customContribution}>
         * @param {string} splitMode 'EQUAL' | 'ITEMWISE' | 'COMBINED'
         * @returns {Object} Comprehensive settlement report and audit trail
         */
        calculateSettlement: function(bill, participants, splitMode) {
            splitMode = splitMode || 'ITEMWISE';
            var activeParticipants = (participants || []).filter(function(p) { return !p.isExcluded; });
            var allParticipantMap = {};
            (participants || []).forEach(function(p) { allParticipantMap[p.id] = p; });

            if (activeParticipants.length === 0) {
                return {
                    error: "No active participants selected for settlement",
                    participants: [],
                    reconciliation: { isBalanced: false, discrepancyPaise: 0 }
                };
            }

            // 1. Convert all monetary figures to integer paise
            var totalDiscountPaise = this.toPaise(bill.discountAmount || 0);
            var totalCgstPaise = this.toPaise(bill.cgstAmount || 0);
            var totalSgstPaise = this.toPaise(bill.sgstAmount || 0);
            var totalIgstPaise = this.toPaise(bill.igstAmount || 0);
            var totalServiceChargePaise = this.toPaise(bill.serviceChargeAmount || 0);
            var totalTipPaise = this.toPaise(bill.tipAmount || 0);
            var totalOtherChargesPaise = this.toPaise(bill.otherChargesAmount || 0);
            var billGrandTotalPaise = this.toPaise(bill.grandTotal || 0);

            // 2. Calculate baseline line items per participant
            var participantItemAllocations = {};
            activeParticipants.forEach(function(p) {
                participantItemAllocations[p.id] = {
                    id: p.id,
                    name: p.name,
                    items: [], // Array of { itemName, qty, unitPricePaise, allocatedPaise, shareNote }
                    rawSubtotalPaise: 0,
                    discountPaise: 0,
                    cgstPaise: 0,
                    sgstPaise: 0,
                    igstPaise: 0,
                    serviceChargePaise: 0,
                    tipPaise: 0,
                    otherChargesPaise: 0,
                    netPayablePaise: 0,
                    customContributionPaise: p.customContribution !== undefined ? SplitSmartCalc.toPaise(p.customContribution) : null
                };
            });

            var totalCalculatedItemSubtotalPaise = 0;

            if (splitMode === 'EQUAL') {
                // In Equal Split: Entire bill items subtotal is shared equally among active participants
                (bill.items || []).forEach(function(item) {
                    var itemTotalPaise = SplitSmartCalc.toPaise(item.price) * (item.qty || 1);
                    totalCalculatedItemSubtotalPaise += itemTotalPaise;
                });

                // If bill has explicit subtotal, honor it if items subtotal is zero or different
                var billSubtotalPaise = bill.subtotal ? this.toPaise(bill.subtotal) : totalCalculatedItemSubtotalPaise;
                var effectiveSubtotal = billSubtotalPaise > 0 ? billSubtotalPaise : totalCalculatedItemSubtotalPaise;

                var equalShares = this.distributeEqually(effectiveSubtotal, activeParticipants.map(function(p) { return p.id; }));
                activeParticipants.forEach(function(p) {
                    participantItemAllocations[p.id].rawSubtotalPaise = equalShares[p.id];
                    participantItemAllocations[p.id].items.push({
                        itemName: "Equal Share of All Bill Items",
                        qty: 1,
                        unitPricePaise: equalShares[p.id],
                        allocatedPaise: equalShares[p.id],
                        shareNote: "1/" + activeParticipants.length + " share"
                    });
                });
            } else {
                // ITEMWISE or COMBINED Mode
                var unallocatedItems = [];

                (bill.items || []).forEach(function(item) {
                    var unitPricePaise = SplitSmartCalc.toPaise(item.price);
                    var itemQty = item.qty || 1;
                    var itemTotalPaise = unitPricePaise * itemQty;
                    totalCalculatedItemSubtotalPaise += itemTotalPaise;

                    var allocations = item.allocatedTo || [];
                    // Filter allocations to only currently active participants
                    var activeItemAllocations = allocations.filter(function(a) {
                        return activeParticipants.some(function(p) { return p.id === a.participantId; });
                    });

                    if (activeItemAllocations.length === 0) {
                        // Not assigned to any active diner
                        unallocatedItems.push({
                            item: item,
                            itemTotalPaise: itemTotalPaise
                        });
                    } else if (activeItemAllocations.length === 1 && (!activeItemAllocations[0].qty || activeItemAllocations[0].qty >= itemQty)) {
                        // Single participant took the entire item
                        var pid = activeItemAllocations[0].participantId;
                        if (participantItemAllocations[pid]) {
                            participantItemAllocations[pid].rawSubtotalPaise += itemTotalPaise;
                            participantItemAllocations[pid].items.push({
                                itemId: item.id,
                                itemName: item.name,
                                qty: itemQty,
                                unitPricePaise: unitPricePaise,
                                allocatedPaise: itemTotalPaise,
                                shareNote: "Full item (Qty: " + itemQty + ")"
                            });
                        }
                    } else {
                        // Shared item: either by quantity or by proportional weights/percentages
                        var hasSpecificQtys = activeItemAllocations.some(function(a) { return a.qty && a.qty > 0; });
                        var weights = [];

                        if (hasSpecificQtys) {
                            activeItemAllocations.forEach(function(a) {
                                weights.push({ id: a.participantId, weight: a.qty || 1 });
                            });
                        } else {
                            activeItemAllocations.forEach(function(a) {
                                weights.push({ id: a.participantId, weight: a.sharePercent || 1 });
                            });
                        }

                        var itemDistributed = SplitSmartCalc.distributeProportionately(itemTotalPaise, weights);

                        activeItemAllocations.forEach(function(a) {
                            var pid = a.participantId;
                            if (participantItemAllocations[pid]) {
                                var allocatedAmount = itemDistributed[pid] || 0;
                                participantItemAllocations[pid].rawSubtotalPaise += allocatedAmount;
                                
                                var note = hasSpecificQtys ? 
                                    ("Qty: " + (a.qty || 1) + "/" + itemQty) : 
                                    ("Shared (" + (a.sharePercent ? a.sharePercent + "%" : "1/" + activeItemAllocations.length) + ")");

                                participantItemAllocations[pid].items.push({
                                    itemId: item.id,
                                    itemName: item.name,
                                    qty: a.qty || (1 / activeItemAllocations.length),
                                    unitPricePaise: unitPricePaise,
                                    allocatedPaise: allocatedAmount,
                                    shareNote: note
                                });
                            }
                        });
                    }
                });

                // In Combined Split: Any unallocated common items (e.g. water, breads, condiments) are divided equally among all active participants
                if (unallocatedItems.length > 0) {
                    if (splitMode === 'COMBINED') {
                        var totalUnallocatedPaise = 0;
                        unallocatedItems.forEach(function(u) { totalUnallocatedPaise += u.itemTotalPaise; });

                        var sharedUnallocated = SplitSmartCalc.distributeEqually(totalUnallocatedPaise, activeParticipants.map(function(p) { return p.id; }));
                        activeParticipants.forEach(function(p) {
                            participantItemAllocations[p.id].rawSubtotalPaise += sharedUnallocated[p.id];
                            participantItemAllocations[p.id].items.push({
                                itemName: "Shared Common Items (" + unallocatedItems.length + " items)",
                                qty: 1,
                                unitPricePaise: sharedUnallocated[p.id],
                                allocatedPaise: sharedUnallocated[p.id],
                                shareNote: "Divided equally among all diners"
                            });
                        });
                    } else {
                        // In standard Itemwise, if there are unallocated items, distribute them equally as fallback to prevent bill total mismatch
                        var unallocatedSum = 0;
                        unallocatedItems.forEach(function(u) { unallocatedSum += u.itemTotalPaise; });
                        var sharedFallbacks = SplitSmartCalc.distributeEqually(unallocatedSum, activeParticipants.map(function(p) { return p.id; }));
                        activeParticipants.forEach(function(p) {
                            participantItemAllocations[p.id].rawSubtotalPaise += sharedFallbacks[p.id];
                            participantItemAllocations[p.id].items.push({
                                itemName: "Unallocated Bill Items (Auto-Shared)",
                                qty: 1,
                                unitPricePaise: sharedFallbacks[p.id],
                                allocatedPaise: sharedFallbacks[p.id],
                                shareNote: "Unassigned items shared equally"
                            });
                        });
                    }
                }
            }

            // 3. Calculate sum of participants' raw subtotals
            var totalParticipantsSubtotalPaise = 0;
            activeParticipants.forEach(function(p) {
                totalParticipantsSubtotalPaise += participantItemAllocations[p.id].rawSubtotalPaise;
            });

            // 4. Proportionate Discount Allocation
            var weightsForDiscount = activeParticipants.map(function(p) {
                return { id: p.id, weight: participantItemAllocations[p.id].rawSubtotalPaise };
            });
            var discountDistribution = this.distributeProportionately(totalDiscountPaise, weightsForDiscount);

            activeParticipants.forEach(function(p) {
                var dPaise = discountDistribution[p.id] || 0;
                participantItemAllocations[p.id].discountPaise = dPaise;
            });

            // 5. Post-discount taxable basis for each participant
            var weightsForTaxes = activeParticipants.map(function(p) {
                var postDiscount = Math.max(0, participantItemAllocations[p.id].rawSubtotalPaise - participantItemAllocations[p.id].discountPaise);
                return { id: p.id, weight: postDiscount };
            });

            // 6. Proportionate Tax Distribution (CGST, SGST, IGST)
            var cgstDistribution = this.distributeProportionately(totalCgstPaise, weightsForTaxes);
            var sgstDistribution = this.distributeProportionately(totalSgstPaise, weightsForTaxes);
            var igstDistribution = this.distributeProportionately(totalIgstPaise, weightsForTaxes);

            // 7. Service Charge & Tip Allocation
            // Service charge is typically proportional to food consumption (post-discount or subtotal)
            var serviceChargeDistribution = this.distributeProportionately(totalServiceChargePaise, weightsForTaxes);
            
            // Tip can be proportional or equal; by default proportional to service
            var tipDistribution = this.distributeProportionately(totalTipPaise, weightsForTaxes);
            var otherChargesDistribution = this.distributeProportionately(totalOtherChargesPaise, weightsForTaxes);

            // 8. Aggregate and calculate final Net Payable per participant
            var sumCalculatedPayablePaise = 0;

            activeParticipants.forEach(function(p) {
                var alloc = participantItemAllocations[p.id];
                alloc.cgstPaise = cgstDistribution[p.id] || 0;
                alloc.sgstPaise = sgstDistribution[p.id] || 0;
                alloc.igstPaise = igstDistribution[p.id] || 0;
                alloc.serviceChargePaise = serviceChargeDistribution[p.id] || 0;
                alloc.tipPaise = tipDistribution[p.id] || 0;
                alloc.otherChargesPaise = otherChargesDistribution[p.id] || 0;

                var net = alloc.rawSubtotalPaise 
                        - alloc.discountPaise 
                        + alloc.cgstPaise 
                        + alloc.sgstPaise 
                        + alloc.igstPaise 
                        + alloc.serviceChargePaise 
                        + alloc.tipPaise 
                        + alloc.otherChargesPaise;

                // If user entered a custom contribution override (e.g. "I already paid ₹500"), calculate balance
                alloc.netPayablePaise = net;
                sumCalculatedPayablePaise += net;
            });

            // 9. Reconciliation with Bill Grand Total
            // If the bill has an explicit grand total that differs slightly due to bill-level roundoff:
            var discrepancyPaise = billGrandTotalPaise > 0 ? (billGrandTotalPaise - sumCalculatedPayablePaise) : 0;

            if (discrepancyPaise !== 0) {
                // Reconcile discrepancy using largest remainder method on active participants
                var reconcWeights = activeParticipants.map(function(p) {
                    return { id: p.id, weight: participantItemAllocations[p.id].netPayablePaise };
                });
                var discrepancyAlloc = this.distributeProportionately(Math.abs(discrepancyPaise), reconcWeights);

                var sign = discrepancyPaise > 0 ? 1 : -1;
                activeParticipants.forEach(function(p) {
                    var adjustment = (discrepancyAlloc[p.id] || 0) * sign;
                    participantItemAllocations[p.id].netPayablePaise += adjustment;
                    participantItemAllocations[p.id].reconciliationAdjustmentPaise = adjustment;
                });
                sumCalculatedPayablePaise = billGrandTotalPaise;
            }

            // 10. Optional: Round to Nearest Rupee (integer rupees for clean cash/UPI transfers)
            if (bill.roundToNearestRupee) {
                var targetTotalRupees = Math.round(billGrandTotalPaise / 100);
                var targetTotalPaise = targetTotalRupees * 100;

                var rupeeFloorList = [];
                var sumRoundedRupees = 0;

                activeParticipants.forEach(function(p, idx) {
                    var currPaise = participantItemAllocations[p.id].netPayablePaise;
                    var exactRupees = currPaise / 100;
                    var floorRupees = Math.floor(exactRupees);
                    var remainder = exactRupees - floorRupees;
                    rupeeFloorList.push({
                        id: p.id,
                        index: idx,
                        floorRupees: floorRupees,
                        remainder: remainder
                    });
                    sumRoundedRupees += floorRupees;
                });

                var remainingRupees = targetTotalRupees - sumRoundedRupees;
                rupeeFloorList.sort(function(a, b) {
                    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
                    return a.index - b.index;
                });

                for (var r = 0; r < rupeeFloorList.length; r++) {
                    var extraRupee = (r < remainingRupees) ? 1 : 0;
                    var finalRupees = rupeeFloorList[r].floorRupees + extraRupee;
                    participantItemAllocations[rupeeFloorList[r].id].netPayablePaise = finalRupees * 100;
                }
                sumCalculatedPayablePaise = targetTotalPaise;
            }

            // 11. Format final results into Forbes-grade financial presentation objects
            var finalParticipants = activeParticipants.map(function(p) {
                var a = participantItemAllocations[p.id];
                var sharePercent = billGrandTotalPaise > 0 ? ((a.netPayablePaise / billGrandTotalPaise) * 100).toFixed(1) : 0;

                return {
                    id: a.id,
                    name: a.name,
                    items: a.items,
                    rawSubtotalPaise: a.rawSubtotalPaise,
                    rawSubtotalFormatted: SplitSmartCalc.toRupees(a.rawSubtotalPaise, true),
                    discountPaise: a.discountPaise,
                    discountFormatted: SplitSmartCalc.toRupees(a.discountPaise, true),
                    cgstPaise: a.cgstPaise,
                    cgstFormatted: SplitSmartCalc.toRupees(a.cgstPaise, true),
                    sgstPaise: a.sgstPaise,
                    sgstFormatted: SplitSmartCalc.toRupees(a.sgstPaise, true),
                    igstPaise: a.igstPaise,
                    igstFormatted: SplitSmartCalc.toRupees(a.igstPaise, true),
                    serviceChargePaise: a.serviceChargePaise,
                    serviceChargeFormatted: SplitSmartCalc.toRupees(a.serviceChargePaise, true),
                    tipPaise: a.tipPaise,
                    tipFormatted: SplitSmartCalc.toRupees(a.tipPaise, true),
                    netPayablePaise: a.netPayablePaise,
                    netPayableFormatted: SplitSmartCalc.toRupees(a.netPayablePaise, true),
                    netPayableNumeric: a.netPayablePaise / 100,
                    sharePercent: sharePercent,
                    reconciliationAdjustmentPaise: a.reconciliationAdjustmentPaise || 0
                };
            });

            return {
                billTitle: bill.restaurantName || "Restaurant Settlement",
                invoiceNumber: bill.invoiceNumber || "",
                date: bill.date || new Date().toISOString().split('T')[0],
                splitMode: splitMode,
                billTotals: {
                    rawSubtotalPaise: totalCalculatedItemSubtotalPaise,
                    rawSubtotalFormatted: this.toRupees(totalCalculatedItemSubtotalPaise, true),
                    discountPaise: totalDiscountPaise,
                    discountFormatted: this.toRupees(totalDiscountPaise, true),
                    cgstPaise: totalCgstPaise,
                    cgstFormatted: this.toRupees(totalCgstPaise, true),
                    sgstPaise: totalSgstPaise,
                    sgstFormatted: this.toRupees(totalSgstPaise, true),
                    igstPaise: totalIgstPaise,
                    igstFormatted: this.toRupees(totalIgstPaise, true),
                    serviceChargePaise: totalServiceChargePaise,
                    serviceChargeFormatted: this.toRupees(totalServiceChargePaise, true),
                    tipPaise: totalTipPaise,
                    tipFormatted: this.toRupees(totalTipPaise, true),
                    grandTotalPaise: billGrandTotalPaise,
                    grandTotalFormatted: this.toRupees(billGrandTotalPaise, true)
                },
                participants: finalParticipants,
                reconciliation: {
                    sumParticipantsPaise: sumCalculatedPayablePaise,
                    billGrandTotalPaise: billGrandTotalPaise,
                    isBalanced: sumCalculatedPayablePaise === billGrandTotalPaise,
                    discrepancyPaise: billGrandTotalPaise - sumCalculatedPayablePaise,
                    formattedDifference: this.toRupees(Math.abs(billGrandTotalPaise - sumCalculatedPayablePaise), true)
                }
            };
        }
    };

    window.SplitSmartCalc = SplitSmartCalc;

})(window);
