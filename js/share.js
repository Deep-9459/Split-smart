/**
 * SplitSmart - WhatsApp & Bill Sharing Module
 * Generates Forbes-grade Financial Receipt Markdown for WhatsApp, Web Share API, SMS, and Group Reports
 */

(function(window) {
    'use strict';

    var SplitSmartShare = {
        /**
         * Generate itemized WhatsApp payment request message for an individual participant
         * @param {Object} participant Settlement participant object
         * @param {Object} bill Full bill object
         * @param {Object} upiProfile Active recipient UPI profile { name, upiId }
         * @returns {string} Formatted WhatsApp message
         */
        generateParticipantMessage: function(participant, bill, upiProfile) {
            var restaurant = bill.restaurantName || "Restaurant Settlement";
            var date = bill.date || new Date().toISOString().split('T')[0];
            var inv = bill.invoiceNumber ? (" | Inv #" + bill.invoiceNumber) : "";
            var payee = upiProfile.name || "SplitSmart Payee";
            var upiId = upiProfile.upiId || "";

            var upiLink = "";
            if (upiId) {
                var cleanNote = ("SplitSmart " + restaurant + " " + participant.name).substring(0, 45);
                upiLink = SplitSmartUPI.generateUPILink({
                    upiId: upiId,
                    payeeName: payee,
                    amountRupees: (participant.netPayablePaise / 100),
                    note: cleanNote
                });
            }

            var lines = [];
            lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━");
            lines.push("🏛 *" + restaurant.toUpperCase() + "*");
            lines.push("📅 Date: " + date + inv);
            lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━");
            lines.push("👤 *Settlement for:* " + participant.name);
            lines.push("");
            lines.push("🍴 *Your Consumed Items:*");

            if (participant.items && participant.items.length > 0) {
                participant.items.forEach(function(item) {
                    var priceStr = SplitSmartCalc.toRupees(item.allocatedPaise, true);
                    var noteStr = item.shareNote ? (" (" + item.shareNote + ")") : "";
                    lines.push(" • " + item.itemName + noteStr + " : *" + priceStr + "*");
                });
            } else {
                lines.push(" • Equal Share Allocation : *" + participant.rawSubtotalFormatted + "*");
            }

            lines.push("");
            lines.push("─────────────────────────");
            lines.push("Food Subtotal: " + participant.rawSubtotalFormatted);

            if (participant.discountPaise > 0) {
                lines.push("Discount Share: -" + participant.discountFormatted);
            }
            if (participant.cgstPaise > 0) {
                lines.push("CGST Share: +" + participant.cgstFormatted);
            }
            if (participant.sgstPaise > 0) {
                lines.push("SGST Share: +" + participant.sgstFormatted);
            }
            if (participant.igstPaise > 0) {
                lines.push("IGST Share: +" + participant.igstFormatted);
            }
            if (participant.serviceChargePaise > 0) {
                lines.push("Service Charge: +" + participant.serviceChargeFormatted);
            }
            if (participant.tipPaise > 0) {
                lines.push("Tip Share: +" + participant.tipFormatted);
            }

            lines.push("─────────────────────────");
            lines.push("💵 *TOTAL PAYABLE: " + participant.netPayableFormatted + "*");
            lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━");

            if (upiId) {
                lines.push("📲 *Pay via UPI to " + payee + ":*");
                lines.push("UPI ID: `" + upiId + "`");
                lines.push("");
                lines.push("👉 *Tap here to pay instantly:*");
                lines.push(upiLink);
                lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━");
            }

            lines.push("⚡ Settled with SplitSmart PWA");
            lines.push("The Financial Standard for Bill Settlement");

            return lines.join("\n");
        },

        /**
         * Generate consolidated group settlement report
         * @param {Object} settlementResult Output of SplitSmartCalc.calculateSettlement
         * @param {Object} upiProfile Active recipient UPI profile
         * @returns {string} Formatted Group Summary message
         */
        generateGroupSummaryReport: function(settlementResult, upiProfile) {
            var restaurant = settlementResult.billTitle || "Restaurant Settlement";
            var date = settlementResult.date || new Date().toISOString().split('T')[0];
            var totals = settlementResult.billTotals;

            var lines = [];
            lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            lines.push("📊 *SPLITSMART EXPENSE SETTLEMENT REPORT*");
            lines.push("🏛 *" + restaurant.toUpperCase() + "*");
            lines.push("📅 Date: " + date);
            lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            lines.push("");
            lines.push("🧾 *BILL AUDIT BREAKDOWN:*");
            lines.push(" • Food & Items Subtotal: " + totals.rawSubtotalFormatted);
            if (totals.discountPaise > 0) lines.push(" • Total Discount: -" + totals.discountFormatted);
            if (totals.serviceChargePaise > 0) lines.push(" • Service Charge: +" + totals.serviceChargeFormatted);
            if (totals.cgstPaise > 0) lines.push(" • CGST: +" + totals.cgstFormatted);
            if (totals.sgstPaise > 0) lines.push(" • SGST: +" + totals.sgstFormatted);
            if (totals.igstPaise > 0) lines.push(" • IGST: +" + totals.igstFormatted);
            if (totals.tipPaise > 0) lines.push(" • Tip: +" + totals.tipFormatted);
            lines.push("─────────────────────────────────");
            lines.push("💰 *GRAND BILL TOTAL: " + totals.grandTotalFormatted + "*");
            lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            lines.push("");
            lines.push("👥 *PARTICIPANT LIABILITIES (" + settlementResult.participants.length + " Diners):*");

            settlementResult.participants.forEach(function(p, i) {
                lines.push((i + 1) + ". *" + p.name + "*: " + p.netPayableFormatted + " (" + p.sharePercent + "%)");
            });

            lines.push("");
            lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            if (upiProfile && upiProfile.upiId) {
                lines.push("📲 *Settlement Beneficiary Account:*");
                lines.push("Name: " + upiProfile.name);
                lines.push("UPI ID: `" + upiProfile.upiId + "`");
                lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            }

            lines.push("⚡ Generated by SplitSmart — An Initiative by Deep Jhaveri");

            return lines.join("\n");
        },

        /**
         * Open WhatsApp with pre-filled message
         * @param {string} messageText 
         * @param {string} phoneNumber Optional phone number (digits only, e.g. 919876543210)
         */
        shareViaWhatsApp: function(messageText, phoneNumber) {
            var encoded = encodeURIComponent(messageText);
            var url = phoneNumber ? 
                ("https://api.whatsapp.com/send?phone=" + phoneNumber.replace(/[^0-9]/g, '') + "&text=" + encoded) : 
                ("https://api.whatsapp.com/send?text=" + encoded);
            window.open(url, '_blank');
        },

        /**
         * Open SMS client
         * @param {string} messageText 
         * @param {string} phoneNumber Optional
         */
        shareViaSMS: function(messageText, phoneNumber) {
            var encoded = encodeURIComponent(messageText);
            var recipient = phoneNumber ? phoneNumber.replace(/[^0-9+]/g, '') : '';
            var url = "sms:" + recipient + (navigator.userAgent.match(/iPhone|iPad|iPod/i) ? "&" : "?") + "body=" + encoded;
            window.location.href = url;
        },

        /**
         * Use Native Mobile Web Share API if available
         * @param {string} title 
         * @param {string} messageText 
         * @returns {Promise<boolean>}
         */
        shareNative: function(title, messageText) {
            if (navigator.share) {
                return navigator.share({
                    title: title,
                    text: messageText
                }).then(function() { return true; }).catch(function(err) {
                    if (err.name !== 'AbortError') console.warn("Share failed", err);
                    return false;
                });
            } else {
                return SplitSmartUPI.copyToClipboard(messageText);
            }
        }
    };

    window.SplitSmartShare = SplitSmartShare;

})(window);
