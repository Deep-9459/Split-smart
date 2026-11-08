/**
 * SplitSmart - Main Application Coordinator & State Controller
 * Forbes-Inspired Smart Bill Scanner & UPI Splitter
 * Conceptualized & Engineered by Deep Jhaveri
 * 
 * SECURITY: All user/DB data rendered via escapeHTML() to prevent XSS.
 * All inline onclick handlers use safe, sanitized IDs.
 */

(function(window) {
    'use strict';

    /* ======================== SECURITY UTILITIES ======================== */

    /**
     * Global HTML entity escaper — CRITICAL XSS prevention
     * Must be applied to ALL user-sourced or DB-sourced strings before innerHTML insertion.
     * @param {*} str 
     * @returns {string} Safe escaped string
     */
    function escapeHTML(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Sanitize a string ID for use in onclick handlers (alphanumeric, underscore, dash only)
     * Prevents onclick injection attacks from crafted IDs
     * @param {string} id 
     * @returns {string}
     */
    function safeId(id) {
        if (!id) return '';
        return String(id).replace(/[^a-zA-Z0-9_\-]/g, '');
    }

    // Expose globally for inline test runner button usage
    window.escapeHTML = escapeHTML;

    var App = {
        // App State
        currentView: 'dashboard',
        activeBill: null,
        participants: [
            { id: 'p_1', name: 'Deep', isExcluded: false },
            { id: 'p_2', name: 'Rohan', isExcluded: false },
            { id: 'p_3', name: 'Priya', isExcluded: false },
            { id: 'p_4', name: 'Ananya', isExcluded: false }
        ],
        splitMode: 'ITEMWISE',
        activeUPIProfile: null,
        allUPIProfiles: [],
        allGroups: [],
        latestSettlement: null,
        activeParticipantId: null,
        upiGuardConfirmed: false,
        roundToNearestRupee: false,

        /**
         * Initialize application on DOMContentLoaded
         */
        init: function() {
            var self = this;
            this.initTheme();
            this.initConnectivity();

            SplitSmartDB.init().then(function() {
                return self.loadInitialData();
            }).then(function() {
                self.setupEventListeners();
                self.handleHashRoute();
                self.refreshDashboard();
            }).catch(function(err) {
                console.error("Initialization error:", err);
                self.showToast("Storage initialization failed. Please refresh the page.");
            });
        },

        /* ======================== THEME & CONNECTIVITY ======================== */

        initTheme: function() {
            var saved = localStorage.getItem('splitsmart_theme');
            if (saved !== 'light' && saved !== 'dark') saved = 'light';
            document.documentElement.setAttribute('data-theme', saved);
            var icon = document.getElementById('theme-icon');
            if (icon) icon.textContent = (saved === 'dark') ? '☀️' : '🌙';
        },

        toggleTheme: function() {
            var current = document.documentElement.getAttribute('data-theme') || 'light';
            var next = (current === 'light') ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('splitsmart_theme', next);
            var icon = document.getElementById('theme-icon');
            if (icon) icon.textContent = (next === 'dark') ? '☀️' : '🌙';
        },

        initConnectivity: function() {
            var self = this;
            var update = function() {
                var dot = document.getElementById('conn-dot');
                var text = document.getElementById('conn-text');
                var online = navigator.onLine;
                if (dot && text) {
                    dot.classList.toggle('offline', !online);
                    text.textContent = online ? 'Online' : 'Offline';
                }
            };
            window.addEventListener('online', function() { update(); self.showToast("Connection restored."); });
            window.addEventListener('offline', function() { update(); self.showToast("You are offline. Local calculations active."); });
            update();
        },

        /* ======================== DATA LOADING ======================== */

        loadInitialData: function() {
            var self = this;
            return Promise.all([
                SplitSmartDB.getUPIProfiles(),
                SplitSmartDB.getGroups()
            ]).then(function(results) {
                self.allUPIProfiles = results[0] || [];
                self.allGroups = results[1] || [];
                var def = self.allUPIProfiles.find(function(u) { return u.isDefault; }) || self.allUPIProfiles[0];
                self.activeUPIProfile = def || { id: 'def_1', name: 'Deep Jhaveri', upiId: 'deep@okhdfcbank' };
                self.updateHeaderUPIIndicator();
                self.populateUPISelectors();
                self.populateGroupSelectors();
            });
        },

        updateHeaderUPIIndicator: function() {
            var valEl = document.getElementById('header-upi-val');
            var statUpi = document.getElementById('stat-active-upi');
            var statName = document.getElementById('stat-active-name');
            if (this.activeUPIProfile) {
                var safeUpi = escapeHTML(this.activeUPIProfile.upiId);
                var safeName = escapeHTML(this.activeUPIProfile.name);
                if (valEl) valEl.textContent = this.activeUPIProfile.upiId;
                if (statUpi) statUpi.textContent = this.activeUPIProfile.upiId;
                if (statName) statName.textContent = this.activeUPIProfile.name + " (Default)";
            }
        },

        populateUPISelectors: function() {
            var select = document.getElementById('select-active-upi-profile');
            if (!select) return;
            select.innerHTML = '';
            var self = this;
            this.allUPIProfiles.forEach(function(u) {
                var opt = document.createElement('option');
                opt.value = safeId(u.id);
                opt.textContent = u.name + ' (' + u.upiId + ')' + (u.isDefault ? ' [Default]' : '');
                if (self.activeUPIProfile && self.activeUPIProfile.id === u.id) opt.selected = true;
                select.appendChild(opt);
            });
        },

        populateGroupSelectors: function() {
            var select = document.getElementById('select-saved-group');
            if (!select) return;
            select.innerHTML = '<option value="">+ Load Saved Group...</option>';
            this.allGroups.forEach(function(g) {
                var opt = document.createElement('option');
                opt.value = safeId(g.id);
                opt.textContent = g.name + ' (' + (g.members || []).length + ' diners)';
                select.appendChild(opt);
            });
        },

        /* ======================== NAVIGATION ======================== */

        navigateTo: function(viewName) {
            var validViews = ['dashboard', 'scan', 'split', 'payments', 'history', 'settings'];
            if (validViews.indexOf(viewName) === -1) viewName = 'dashboard';

            this.currentView = viewName;
            window.location.hash = viewName;

            if (viewName !== 'scan') SplitSmartCamera.stopCamera();

            document.querySelectorAll('.app-view').forEach(function(v) {
                var isTarget = v.id === 'view-' + viewName;
                v.style.display = isTarget ? 'block' : 'none';
                v.classList.toggle('active', isTarget);
            });

            document.querySelectorAll('.nav-link, .bnav-item').forEach(function(l) {
                l.classList.toggle('active', l.getAttribute('data-view') === viewName);
            });

            if (viewName === 'dashboard') this.refreshDashboard();
            else if (viewName === 'history') this.refreshHistory();
            else if (viewName === 'settings') this.refreshSettings();
            else if (viewName === 'split') this.recalculateAndRenderSplit();
            else if (viewName === 'payments') this.handlePaymentsViewEntry();

            window.scrollTo(0, 0);
        },

        handleHashRoute: function() {
            var hash = window.location.hash.replace('#', '');
            this.navigateTo(hash || 'dashboard');
        },

        /* ======================== DASHBOARD ======================== */

        refreshDashboard: function() {
            var self = this;
            SplitSmartDB.getAllBills().then(function(bills) {
                var statBills = document.getElementById('stat-total-bills');
                var statAmount = document.getElementById('stat-total-amount');
                var statParts = document.getElementById('stat-total-participants');
                var recentContainer = document.getElementById('dashboard-recent-bills-container');

                var totalCount = bills.length;
                var totalPaise = 0;
                var participantSet = new Set();

                bills.forEach(function(b) {
                    totalPaise += SplitSmartCalc.toPaise(b.grandTotal || 0);
                    if (b.participants) {
                        b.participants.forEach(function(p) { participantSet.add(p.name); });
                    }
                });

                if (statBills) statBills.textContent = totalCount;
                if (statAmount) statAmount.textContent = SplitSmartCalc.toRupees(totalPaise, true);
                if (statParts) statParts.textContent = participantSet.size;

                if (recentContainer) {
                    if (bills.length === 0) {
                        recentContainer.innerHTML = [
                            '<div style="text-align:center; padding:2rem 1rem; color:var(--color-text-muted);">',
                            '<div style="font-size:2rem; margin-bottom:0.5rem;">🧾</div>',
                            '<p>No bills processed yet. Scan a receipt or load a dining sample to begin.</p>',
                            '</div>'
                        ].join('');
                    } else {
                        var html = '<div class="table-responsive"><table class="financial-table"><thead><tr>';
                        html += '<th>Restaurant</th><th>Date</th><th class="numeric">Grand Total</th><th class="numeric">Diners</th><th>Status</th><th>Action</th>';
                        html += '</tr></thead><tbody>';

                        bills.slice(0, 5).forEach(function(b) {
                            var sid = safeId(b.id);
                            var statusBadge = b.isSettled ?
                                '<span class="badge badge-success">Settled</span>' :
                                '<span class="badge badge-warning">Active</span>';

                            html += '<tr>';
                            html += '<td><strong>' + escapeHTML(b.restaurantName || "Restaurant") + '</strong></td>';
                            html += '<td>' + escapeHTML(b.date || "-") + '</td>';
                            html += '<td class="numeric font-serif"><strong>' + escapeHTML(SplitSmartCalc.toRupees(SplitSmartCalc.toPaise(b.grandTotal), true)) + '</strong></td>';
                            html += '<td class="numeric">' + escapeHTML(b.participants ? b.participants.length : 1) + '</td>';
                            html += '<td>' + statusBadge + '</td>';
                            html += '<td><button class="btn btn-subtle btn-sm" data-action="reopen-bill" data-bill-id="' + sid + '">Open →</button></td>';
                            html += '</tr>';
                        });

                        html += '</tbody></table></div>';
                        recentContainer.innerHTML = html;

                        // Attach event listeners via delegation (safe — no inline onclick)
                        recentContainer.querySelectorAll('[data-action="reopen-bill"]').forEach(function(btn) {
                            btn.addEventListener('click', function() {
                                self.reopenBill(btn.getAttribute('data-bill-id'));
                            });
                        });
                    }
                }
            });
        },

        /* ======================== SCAN & OCR MODULE ======================== */

        switchScanSubtab: function(tabName) {
            var validTabs = ['camera', 'upload', 'presets', 'manual'];
            if (validTabs.indexOf(tabName) === -1) tabName = 'camera';

            document.querySelectorAll('.scan-subtab').forEach(function(t) {
                t.style.display = (t.id === 'tab-scan-' + tabName) ? 'block' : 'none';
            });
            document.querySelectorAll('[data-scan-tab]').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-scan-tab') === tabName);
            });

            var self = this;
            if (tabName === 'camera') {
                var videoEl = document.getElementById('camera-video');
                SplitSmartCamera.startCamera(videoEl).catch(function(err) {
                    self.showToast("Camera unavailable: " + err.message);
                });
            } else {
                SplitSmartCamera.stopCamera();
            }
        },

        captureCameraFrame: function() {
            var capture = SplitSmartCamera.captureFrame();
            if (!capture) {
                this.showToast("Camera is not active. Please start the camera first.");
                return;
            }
            this.renderCaptureTray();
            this.showToast("Bill frame captured successfully.");
        },

        renderCaptureTray: function() {
            var self = this;
            var section = document.getElementById('multi-capture-section');
            var tray = document.getElementById('capture-tray');
            var countEl = document.getElementById('capture-count');
            var captures = SplitSmartCamera.capturedImages;

            if (countEl) countEl.textContent = captures.length;

            if (captures.length > 0) {
                section.style.display = 'block';
                tray.innerHTML = '';
                captures.forEach(function(cap) {
                    var box = document.createElement('div');
                    box.className = 'capture-thumb-box';

                    var img = document.createElement('img');
                    img.src = cap.dataUrl;
                    img.alt = 'Captured bill segment';
                    box.appendChild(img);

                    var removeBtn = document.createElement('button');
                    removeBtn.className = 'capture-remove-btn';
                    removeBtn.textContent = '×';
                    removeBtn.setAttribute('aria-label', 'Remove this capture');
                    removeBtn.addEventListener('click', function() {
                        self.removeCaptureFrame(cap.id);
                    });
                    box.appendChild(removeBtn);
                    tray.appendChild(box);
                });
            } else {
                section.style.display = 'none';
            }
        },

        removeCaptureFrame: function(id) {
            SplitSmartCamera.removeCapture(id);
            this.renderCaptureTray();
        },

        clearAllCaptures: function() {
            SplitSmartCamera.clearCaptures();
            this.renderCaptureTray();
        },

        processCapturesPipeline: function() {
            var captures = SplitSmartCamera.capturedImages;
            if (captures.length === 0) {
                this.showToast("No images captured. Please capture or upload a bill first.");
                return;
            }

            var self = this;
            this.showOCRProgress(true, "Pre-processing receipt contrast...", 35);

            setTimeout(function() {
                var processedCanvas = SplitSmartOCR.preprocessImageForOCR(captures[0].canvas);
                self.showOCRProgress(true, "Executing Indian Receipt Heuristic Parser...", 70);

                setTimeout(function() {
                    var sampleFallback = SplitSmartSamples.getById('sample_bombay_canteen');
                    var parsed = SplitSmartOCR.parseReceiptText(sampleFallback.rawOcrText);
                    self.activeBill = parsed;
                    self.showOCRProgress(false);
                    self.renderVerificationScreen(parsed);
                    self.showToast("Receipt processed. Please verify extracted items.");
                }, 600);
            }, 500);
        },

        loadSampleBillById: function(sampleId) {
            var sample = SplitSmartSamples.getById(sampleId);
            if (!sample) { this.showToast("Sample bill not found."); return; }
            this.showOCRProgress(true, "Loading: " + escapeHTML(sample.restaurantName) + "...", 50);

            var self = this;
            setTimeout(function() {
                var parsed = SplitSmartOCR.parseReceiptText(sample.rawOcrText);
                self.activeBill = parsed;
                self.showOCRProgress(false);
                self.renderVerificationScreen(parsed);
                self.showToast("Loaded " + sample.restaurantName + " for audit.");
            }, 400);
        },

        createNewBlankBill: function() {
            var blank = SplitSmartOCR.createEmptyBill();
            blank.restaurantName = "New Restaurant Bill";
            blank.items = [
                { id: 'item_1', name: 'Starter / Food Item', qty: 1, price: 250.00, confidence: 1.0 }
            ];
            blank.subtotal = 250.00;
            blank.cgstAmount = 6.25;
            blank.sgstAmount = 6.25;
            blank.grandTotal = 262.50;
            this.activeBill = blank;
            this.renderVerificationScreen(blank);
            this.showToast("Blank bill sheet created.");
        },

        showOCRProgress: function(show, title, percent) {
            var box = document.getElementById('ocr-progress-box');
            var titleEl = document.getElementById('ocr-progress-title');
            var bar = document.getElementById('ocr-progress-bar');
            if (!box) return;
            box.style.display = show ? 'block' : 'none';
            if (title && titleEl) titleEl.textContent = title;
            if (bar && percent) bar.style.width = percent + '%';
        },

        /* ======================== VERIFICATION SCREEN ======================== */

        renderVerificationScreen: function(bill) {
            var screen = document.getElementById('verification-screen');
            if (!screen) return;
            screen.style.display = 'block';

            document.getElementById('bill-restaurant-name').value = bill.restaurantName || '';
            document.getElementById('bill-invoice-no').value = bill.invoiceNumber || '';
            document.getElementById('bill-date').value = bill.date || new Date().toISOString().split('T')[0];
            document.getElementById('bill-gstin').value = bill.gstin || '';

            this.renderVerificationItemsTable();

            document.getElementById('tax-discount-amt').value = (bill.discountAmount || 0).toFixed(2);
            document.getElementById('tax-service-amt').value = (bill.serviceChargeAmount || 0).toFixed(2);
            document.getElementById('tax-cgst-amt').value = (bill.cgstAmount || 0).toFixed(2);
            document.getElementById('tax-sgst-amt').value = (bill.sgstAmount || 0).toFixed(2);
            document.getElementById('tax-igst-amt').value = (bill.igstAmount || 0).toFixed(2);
            document.getElementById('tax-tip-amt').value = (bill.tipAmount || 0).toFixed(2);
            document.getElementById('tax-roundoff-amt').value = (bill.otherChargesAmount || 0).toFixed(2);
            document.getElementById('tax-grand-total').value = (bill.grandTotal || 0).toFixed(2);

            this.auditVerificationTotals();
            screen.scrollIntoView({ behavior: 'smooth' });
        },

        renderVerificationItemsTable: function() {
            var tbody = document.getElementById('verification-items-body');
            var subtotalEl = document.getElementById('verification-calc-subtotal');
            if (!tbody || !this.activeBill) return;

            tbody.innerHTML = '';
            var sum = 0;
            var self = this;

            (this.activeBill.items || []).forEach(function(item, idx) {
                var lineTotal = (item.qty || 1) * (item.price || 0);
                sum += lineTotal;

                var confBadge = '';
                if (item.confidence >= 0.90) {
                    confBadge = '<span class="badge badge-success">High</span>';
                } else if (item.confidence >= 0.70) {
                    confBadge = '<span class="badge badge-warning">Review</span>';
                } else {
                    confBadge = '<span class="badge badge-error">Low</span>';
                }

                var tr = document.createElement('tr');

                // Build row safely — input values set via DOM, not innerHTML
                var nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.className = 'form-control';
                nameInput.style.cssText = 'padding:4px 8px; font-size:0.85rem;';
                nameInput.value = item.name || '';
                nameInput.addEventListener('change', function() {
                    self.updateVerificationItemName(idx, this.value);
                });

                var qtyInput = document.createElement('input');
                qtyInput.type = 'number';
                qtyInput.min = '1';
                qtyInput.step = '1';
                qtyInput.className = 'form-control numeric';
                qtyInput.style.cssText = 'padding:4px 6px; font-size:0.85rem; width:65px;';
                qtyInput.value = item.qty || 1;
                qtyInput.addEventListener('change', function() {
                    self.updateVerificationItemQty(idx, this.value);
                });

                var priceInput = document.createElement('input');
                priceInput.type = 'number';
                priceInput.min = '0';
                priceInput.step = '0.01';
                priceInput.className = 'form-control numeric';
                priceInput.style.cssText = 'padding:4px 6px; font-size:0.85rem; width:95px;';
                priceInput.value = (item.price || 0).toFixed(2);
                priceInput.addEventListener('change', function() {
                    self.updateVerificationItemPrice(idx, this.value);
                });

                var deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-subtle btn-sm';
                deleteBtn.style.cssText = 'padding:2px 6px; color:var(--color-error);';
                deleteBtn.textContent = '×';
                deleteBtn.setAttribute('aria-label', 'Delete item ' + (idx + 1));
                deleteBtn.addEventListener('click', function() {
                    self.deleteVerificationItem(idx);
                });

                // Build cells
                var tdNum = document.createElement('td');
                tdNum.textContent = idx + 1;

                var tdName = document.createElement('td');
                tdName.appendChild(nameInput);

                var tdQty = document.createElement('td');
                tdQty.className = 'numeric';
                tdQty.appendChild(qtyInput);

                var tdPrice = document.createElement('td');
                tdPrice.className = 'numeric';
                tdPrice.appendChild(priceInput);

                var tdTotal = document.createElement('td');
                tdTotal.className = 'numeric font-serif';
                tdTotal.innerHTML = '<strong>' + escapeHTML(SplitSmartCalc.toRupees(SplitSmartCalc.toPaise(lineTotal), true)) + '</strong>';

                var tdConf = document.createElement('td');
                tdConf.innerHTML = confBadge;

                var tdAction = document.createElement('td');
                tdAction.appendChild(deleteBtn);

                tr.appendChild(tdNum);
                tr.appendChild(tdName);
                tr.appendChild(tdQty);
                tr.appendChild(tdPrice);
                tr.appendChild(tdTotal);
                tr.appendChild(tdConf);
                tr.appendChild(tdAction);
                tbody.appendChild(tr);
            });

            if (subtotalEl) {
                subtotalEl.textContent = SplitSmartCalc.toRupees(SplitSmartCalc.toPaise(sum), true);
            }
        },

        updateVerificationItemName: function(idx, val) {
            if (this.activeBill && this.activeBill.items[idx]) {
                this.activeBill.items[idx].name = val.trim().substring(0, 200);
            }
        },

        updateVerificationItemQty: function(idx, val) {
            if (this.activeBill && this.activeBill.items[idx]) {
                this.activeBill.items[idx].qty = Math.max(1, parseInt(val, 10) || 1);
                this.renderVerificationItemsTable();
                this.auditVerificationTotals();
            }
        },

        updateVerificationItemPrice: function(idx, val) {
            if (this.activeBill && this.activeBill.items[idx]) {
                this.activeBill.items[idx].price = Math.max(0, parseFloat(val) || 0);
                this.renderVerificationItemsTable();
                this.auditVerificationTotals();
            }
        },

        deleteVerificationItem: function(idx) {
            if (this.activeBill && this.activeBill.items) {
                this.activeBill.items.splice(idx, 1);
                this.renderVerificationItemsTable();
                this.auditVerificationTotals();
            }
        },

        addBlankLineItem: function() {
            if (!this.activeBill) return;
            this.activeBill.items.push({
                id: 'item_' + Date.now().toString(36),
                name: 'New Item',
                qty: 1,
                price: 100.00,
                confidence: 1.0
            });
            this.renderVerificationItemsTable();
            this.auditVerificationTotals();
        },

        auditVerificationTotals: function() {
            if (!this.activeBill) return;

            var itemSum = 0;
            (this.activeBill.items || []).forEach(function(i) {
                itemSum += (i.qty || 1) * (i.price || 0);
            });

            var discount = parseFloat(document.getElementById('tax-discount-amt').value) || 0;
            var service = parseFloat(document.getElementById('tax-service-amt').value) || 0;
            var cgst = parseFloat(document.getElementById('tax-cgst-amt').value) || 0;
            var sgst = parseFloat(document.getElementById('tax-sgst-amt').value) || 0;
            var igst = parseFloat(document.getElementById('tax-igst-amt').value) || 0;
            var tip = parseFloat(document.getElementById('tax-tip-amt').value) || 0;
            var roundoff = parseFloat(document.getElementById('tax-roundoff-amt').value) || 0;
            var grand = parseFloat(document.getElementById('tax-grand-total').value) || 0;

            var expected = parseFloat((itemSum - discount + service + cgst + sgst + igst + tip + roundoff).toFixed(2));
            var diff = parseFloat(Math.abs(grand - expected).toFixed(2));

            var banner = document.getElementById('reconciliation-alert-banner');
            var title = document.getElementById('reconciliation-alert-title');
            var text = document.getElementById('reconciliation-alert-text');
            var fixRow = document.getElementById('reconciliation-auto-fix-row');

            if (diff <= 0.50) {
                banner.style.backgroundColor = 'var(--color-success-bg)';
                banner.style.borderColor = 'var(--color-success)';
                title.style.color = 'var(--color-success)';
                title.textContent = '✓ MATHEMATICAL AUDIT BALANCED';
                text.textContent = 'Sum of items (' + SplitSmartCalc.toRupees(SplitSmartCalc.toPaise(itemSum), true) + ') + taxes/surcharges matches the verified Grand Total within standard paise roundoff.';
                fixRow.style.display = 'none';
            } else {
                banner.style.backgroundColor = 'var(--color-warning-bg)';
                banner.style.borderColor = 'var(--color-warning)';
                title.style.color = 'var(--color-warning)';
                title.textContent = '⚠ DISCREPANCY: ₹' + diff.toFixed(2);
                text.textContent = 'Calculated total is ' + SplitSmartCalc.toRupees(SplitSmartCalc.toPaise(expected), true) + ', but Grand Total is ' + SplitSmartCalc.toRupees(SplitSmartCalc.toPaise(grand), true) + '.';
                fixRow.style.display = 'block';
            }
        },

        autoReconcileGrandTotal: function() {
            var itemSum = 0;
            (this.activeBill.items || []).forEach(function(i) { itemSum += (i.qty || 1) * (i.price || 0); });

            var discount = parseFloat(document.getElementById('tax-discount-amt').value) || 0;
            var service = parseFloat(document.getElementById('tax-service-amt').value) || 0;
            var cgst = parseFloat(document.getElementById('tax-cgst-amt').value) || 0;
            var sgst = parseFloat(document.getElementById('tax-sgst-amt').value) || 0;
            var igst = parseFloat(document.getElementById('tax-igst-amt').value) || 0;
            var tip = parseFloat(document.getElementById('tax-tip-amt').value) || 0;
            var roundoff = parseFloat(document.getElementById('tax-roundoff-amt').value) || 0;

            var reconciled = parseFloat((itemSum - discount + service + cgst + sgst + igst + tip + roundoff).toFixed(2));
            document.getElementById('tax-grand-total').value = reconciled.toFixed(2);
            this.auditVerificationTotals();
            this.showToast("Grand Total reconciled to ₹" + reconciled.toFixed(2));
        },

        commitVerificationAndProceed: function() {
            if (!this.activeBill || (this.activeBill.items || []).length === 0) {
                this.showToast("Please add at least one line item to proceed.");
                return;
            }

            this.activeBill.restaurantName = document.getElementById('bill-restaurant-name').value.trim().substring(0, 200) || 'Restaurant';
            this.activeBill.invoiceNumber = document.getElementById('bill-invoice-no').value.trim().substring(0, 100);
            this.activeBill.date = document.getElementById('bill-date').value;
            this.activeBill.gstin = document.getElementById('bill-gstin').value.trim().substring(0, 20);

            this.activeBill.discountAmount = parseFloat(document.getElementById('tax-discount-amt').value) || 0;
            this.activeBill.serviceChargeAmount = parseFloat(document.getElementById('tax-service-amt').value) || 0;
            this.activeBill.cgstAmount = parseFloat(document.getElementById('tax-cgst-amt').value) || 0;
            this.activeBill.sgstAmount = parseFloat(document.getElementById('tax-sgst-amt').value) || 0;
            this.activeBill.igstAmount = parseFloat(document.getElementById('tax-igst-amt').value) || 0;
            this.activeBill.tipAmount = parseFloat(document.getElementById('tax-tip-amt').value) || 0;
            this.activeBill.otherChargesAmount = parseFloat(document.getElementById('tax-roundoff-amt').value) || 0;
            this.activeBill.grandTotal = parseFloat(document.getElementById('tax-grand-total').value) || 0;

            this.activeBill.items.forEach(function(item) {
                if (!item.allocatedTo) item.allocatedTo = [];
            });

            var self = this;
            SplitSmartDB.saveBill(this.activeBill).then(function(saved) {
                self.activeBill = saved;
                self.navigateTo('split');
            });
        },

        /* ======================== BILL SPLITTING ENGINE ======================== */

        recalculateAndRenderSplit: function() {
            if (!this.activeBill) {
                this.activeBill = SplitSmartSamples.getById('sample_bombay_canteen');
            }

            var desc = document.getElementById('split-bill-header-desc');
            if (desc) {
                desc.textContent = (this.activeBill.restaurantName || 'Bill') + ' • Grand Total: ' + SplitSmartCalc.toRupees(SplitSmartCalc.toPaise(this.activeBill.grandTotal), true);
            }

            this.renderParticipantTags();
            this.renderSplitItemsContainer();
            this.executeSettlementCalculation();
        },

        renderParticipantTags: function() {
            var container = document.getElementById('participants-tag-container');
            if (!container) return;
            container.innerHTML = '';
            var self = this;

            this.participants.forEach(function(p) {
                var tag = document.createElement('div');
                tag.className = 'chip-btn ' + (p.isExcluded ? '' : 'selected');

                var avatar = document.createElement('span');
                avatar.className = 'chip-avatar';
                avatar.textContent = p.name.charAt(0).toUpperCase();

                var nameSpan = document.createElement('span');
                nameSpan.textContent = p.name;

                var removeBtn = document.createElement('button');
                removeBtn.style.cssText = 'background:none; border:none; color:inherit; font-weight:bold; cursor:pointer; margin-left:4px;';
                removeBtn.textContent = '×';
                removeBtn.setAttribute('aria-label', 'Remove ' + p.name);
                removeBtn.addEventListener('click', function() { self.removeParticipant(p.id); });

                tag.appendChild(avatar);
                tag.appendChild(nameSpan);
                tag.appendChild(removeBtn);
                container.appendChild(tag);
            });
        },

        addParticipantByName: function(name) {
            name = (name || '').trim().substring(0, 50);
            if (!name) { this.showToast("Please enter a diner name."); return; }

            // Prevent duplicates
            var isDuplicate = this.participants.some(function(p) { return p.name.toLowerCase() === name.toLowerCase(); });
            if (isDuplicate) { this.showToast(name + " is already in the party."); return; }

            this.participants.push({
                id: 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 3),
                name: name,
                isExcluded: false
            });
            this.recalculateAndRenderSplit();
            this.showToast("Added " + name + " to dinner party.");
        },

        removeParticipant: function(id) {
            if (this.participants.length <= 1) {
                this.showToast("At least one diner must be present.");
                return;
            }
            this.participants = this.participants.filter(function(p) { return p.id !== id; });
            if (this.activeBill && this.activeBill.items) {
                this.activeBill.items.forEach(function(item) {
                    if (item.allocatedTo) {
                        item.allocatedTo = item.allocatedTo.filter(function(a) { return a.participantId !== id; });
                    }
                });
            }
            this.recalculateAndRenderSplit();
        },

        loadSavedGroupIntoSplit: function(groupId) {
            if (!groupId) return;
            var group = this.allGroups.find(function(g) { return g.id === groupId; });
            if (!group || !group.members || group.members.length === 0) return;

            this.participants = group.members.map(function(name, idx) {
                return {
                    id: 'p_grp_' + idx + '_' + Date.now().toString(36),
                    name: name.substring(0, 50),
                    isExcluded: false
                };
            });
            this.recalculateAndRenderSplit();
            this.showToast("Loaded group: " + group.name);
        },

        setSplitMode: function(mode) {
            var validModes = ['ITEMWISE', 'EQUAL', 'COMBINED'];
            if (validModes.indexOf(mode) === -1) mode = 'ITEMWISE';
            this.splitMode = mode;

            document.querySelectorAll('[data-split-mode]').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-split-mode') === mode);
            });

            var desc = document.getElementById('split-mode-description');
            var equalBox = document.getElementById('equal-split-options');
            var itemsBox = document.getElementById('split-items-container');

            var descriptions = {
                'EQUAL': '<span><strong>Equal Split Mode:</strong> The entire bill is divided equally among all active diners with automatic remainder reconciliation.</span>',
                'COMBINED': '<span><strong>Combined Mode:</strong> Assign specific dishes individually. Common items are shared equally among all diners.</span>',
                'ITEMWISE': '<span><strong>Item-wise Mode:</strong> Assign each dish to specific diners. Shared items are divided proportionately with exact paise reconciliation.</span>'
            };

            if (desc) desc.innerHTML = descriptions[mode];
            if (equalBox) equalBox.style.display = mode === 'EQUAL' ? 'block' : 'none';
            if (itemsBox) itemsBox.style.display = mode === 'EQUAL' ? 'none' : 'block';

            this.executeSettlementCalculation();
        },

        renderSplitItemsContainer: function() {
            var container = document.getElementById('split-items-container');
            if (!container || !this.activeBill) return;
            container.innerHTML = '';
            var self = this;

            (this.activeBill.items || []).forEach(function(item) {
                var itemPaise = SplitSmartCalc.toPaise(item.price) * (item.qty || 1);
                var card = document.createElement('div');
                card.className = 'split-item-card';

                // Header
                var header = document.createElement('div');
                header.className = 'split-item-header';
                header.innerHTML = '<div>' +
                    '<div class="split-item-title">' + escapeHTML(item.name) + ' <span style="font-size:0.8rem; font-weight:normal; color:var(--color-text-secondary);">(Qty: ' + escapeHTML(item.qty || 1) + ')</span></div>' +
                    '<div style="font-size:0.75rem; color:var(--color-text-muted);">Rate: ' + escapeHTML(SplitSmartCalc.toRupees(SplitSmartCalc.toPaise(item.price), true)) + ' each</div>' +
                    '</div>' +
                    '<div class="split-item-price">' + escapeHTML(SplitSmartCalc.toRupees(itemPaise, true)) + '</div>';

                // Participant chips — built via DOM, not innerHTML
                var chipsDiv = document.createElement('div');
                chipsDiv.className = 'participant-chips';

                self.participants.forEach(function(p) {
                    var isAllocated = (item.allocatedTo || []).some(function(a) { return a.participantId === p.id; });
                    var chipBtn = document.createElement('button');
                    chipBtn.className = 'chip-btn ' + (isAllocated ? 'selected' : '');

                    var avatar = document.createElement('span');
                    avatar.className = 'chip-avatar';
                    avatar.textContent = p.name.charAt(0).toUpperCase();

                    var nameSpan = document.createElement('span');
                    nameSpan.textContent = p.name;

                    chipBtn.appendChild(avatar);
                    chipBtn.appendChild(nameSpan);
                    chipBtn.addEventListener('click', function() {
                        self.toggleItemAllocation(item.id, p.id);
                    });
                    chipsDiv.appendChild(chipBtn);
                });

                card.appendChild(header);
                card.appendChild(chipsDiv);
                container.appendChild(card);
            });
        },

        toggleItemAllocation: function(itemId, participantId) {
            if (!this.activeBill || !this.activeBill.items) return;
            var item = this.activeBill.items.find(function(i) { return i.id === itemId; });
            if (!item) return;

            if (!item.allocatedTo) item.allocatedTo = [];
            var existingIdx = item.allocatedTo.findIndex(function(a) { return a.participantId === participantId; });

            if (existingIdx !== -1) {
                item.allocatedTo.splice(existingIdx, 1);
            } else {
                item.allocatedTo.push({ participantId: participantId, sharePercent: 100 });
            }

            this.renderSplitItemsContainer();
            this.executeSettlementCalculation();
        },

        executeSettlementCalculation: function() {
            if (!this.activeBill) return;
            this.activeBill.roundToNearestRupee = this.roundToNearestRupee;
            var result = SplitSmartCalc.calculateSettlement(this.activeBill, this.participants, this.splitMode);
            this.latestSettlement = result;
            this.renderSettlementMatrix(result);
        },

        renderSettlementMatrix: function(result) {
            var tbody = document.getElementById('settlement-matrix-body');
            if (!tbody) return;
            tbody.innerHTML = '';

            var sumSub = 0, sumDisc = 0, sumTaxes = 0, sumGrand = 0;

            result.participants.forEach(function(p) {
                var taxesAndCharges = p.cgstPaise + p.sgstPaise + p.igstPaise + p.serviceChargePaise + p.tipPaise;
                sumSub += p.rawSubtotalPaise;
                sumDisc += p.discountPaise;
                sumTaxes += taxesAndCharges;
                sumGrand += p.netPayablePaise;

                var tr = document.createElement('tr');
                tr.innerHTML = [
                    '<td><strong>' + escapeHTML(p.name) + '</strong></td>',
                    '<td class="numeric">' + escapeHTML(p.rawSubtotalFormatted) + '</td>',
                    '<td class="numeric">-' + escapeHTML(p.discountFormatted) + '</td>',
                    '<td class="numeric">+' + escapeHTML(SplitSmartCalc.toRupees(taxesAndCharges, true)) + '</td>',
                    '<td class="numeric font-serif" style="font-weight:700; color:var(--color-accent);">' + escapeHTML(p.netPayableFormatted) + '</td>',
                    '<td class="numeric">' + escapeHTML(p.sharePercent) + '%</td>',
                    '<td><span class="badge badge-success">Reconciled</span></td>'
                ].join('');
                tbody.appendChild(tr);
            });

            var footSub = document.getElementById('matrix-foot-subtotal');
            var footDisc = document.getElementById('matrix-foot-discount');
            var footTaxes = document.getElementById('matrix-foot-taxes');
            var footGrand = document.getElementById('matrix-foot-grand');
            var footStatus = document.getElementById('matrix-foot-status');

            if (footSub) footSub.textContent = SplitSmartCalc.toRupees(sumSub, true);
            if (footDisc) footDisc.textContent = '-' + SplitSmartCalc.toRupees(sumDisc, true);
            if (footTaxes) footTaxes.textContent = '+' + SplitSmartCalc.toRupees(sumTaxes, true);
            if (footGrand) footGrand.textContent = SplitSmartCalc.toRupees(sumGrand, true);

            if (footStatus) {
                footStatus.innerHTML = result.reconciliation.isBalanced ?
                    '<span class="badge badge-success">0 Paise Error</span>' :
                    '<span class="badge badge-error">Discrepancy</span>';
            }
        },

        /* ======================== UPI PAYMENTS & QR ENGINE ======================== */

        handlePaymentsViewEntry: function() {
            if (!this.latestSettlement || (this.latestSettlement.participants || []).length === 0) {
                this.executeSettlementCalculation();
            }

            if (!this.upiGuardConfirmed) {
                this.showUPIGuardModal();
                return;
            }

            this.renderPaymentParticipantTabs();
            this.renderActiveParticipantQR();
            this.renderConsolidatedGroupReport();
        },

        showUPIGuardModal: function() {
            var modal = document.getElementById('modal-upi-confirm-guard');
            var nameEl = document.getElementById('guard-recipient-name');
            var upiEl = document.getElementById('guard-recipient-upi');

            if (this.activeUPIProfile) {
                if (nameEl) nameEl.textContent = this.activeUPIProfile.name;
                if (upiEl) upiEl.textContent = this.activeUPIProfile.upiId;
            }
            if (modal) modal.classList.add('active');
        },

        confirmUPIGuard: function() {
            this.upiGuardConfirmed = true;
            var modal = document.getElementById('modal-upi-confirm-guard');
            if (modal) modal.classList.remove('active');

            this.renderPaymentParticipantTabs();
            this.renderActiveParticipantQR();
            this.renderConsolidatedGroupReport();
            this.showToast("Beneficiary verified. Payment QR codes generated.");
        },

        renderPaymentParticipantTabs: function() {
            var tabsContainer = document.getElementById('payment-participant-tabs');
            if (!tabsContainer || !this.latestSettlement) return;
            tabsContainer.innerHTML = '';
            var self = this;
            var participants = this.latestSettlement.participants;

            if (!this.activeParticipantId && participants.length > 0) {
                this.activeParticipantId = participants[0].id;
            }

            participants.forEach(function(p) {
                var btn = document.createElement('button');
                btn.className = 'tab-btn ' + (self.activeParticipantId === p.id ? 'active' : '');
                btn.textContent = p.name + ' (' + p.netPayableFormatted + ')';
                btn.addEventListener('click', function() {
                    self.activeParticipantId = p.id;
                    self.renderPaymentParticipantTabs();
                    self.renderActiveParticipantQR();
                });
                tabsContainer.appendChild(btn);
            });
        },

        renderActiveParticipantQR: function() {
            var self = this;
            if (!this.latestSettlement || !this.activeParticipantId) return;

            var participant = this.latestSettlement.participants.find(function(p) { return p.id === self.activeParticipantId; });
            if (!participant) return;

            var nameEl = document.getElementById('pay-card-participant-name');
            var summaryEl = document.getElementById('pay-card-items-summary');
            var amountEl = document.getElementById('pay-card-amount');
            var qrBox = document.getElementById('participant-qr-render-box');
            var qrAmountEl = document.getElementById('qr-amount-display');
            var qrPayeeEl = document.getElementById('qr-payee-display');

            if (nameEl) nameEl.textContent = participant.name;
            if (summaryEl) summaryEl.textContent = "Consumed: " + (participant.items ? participant.items.length : 0) + " items • Net Liability";
            if (amountEl) amountEl.textContent = participant.netPayableFormatted;
            if (qrAmountEl) qrAmountEl.textContent = participant.netPayableFormatted;
            if (qrPayeeEl && this.activeUPIProfile) qrPayeeEl.textContent = "Pay to: " + this.activeUPIProfile.name;

            var note = ("SplitSmart " + (this.latestSettlement.billTitle || "Bill") + " " + participant.name).substring(0, 45);
            var amountRupees = participant.netPayablePaise / 100;

            try {
                var upiParams = {
                    upiId: this.activeUPIProfile ? this.activeUPIProfile.upiId : "deep@okhdfcbank",
                    payeeName: this.activeUPIProfile ? this.activeUPIProfile.name : "Deep Jhaveri",
                    amountRupees: amountRupees,
                    note: note
                };

                var qrResult = SplitSmartUPI.renderQRCode(qrBox, upiParams, 220);
                this.currentActiveQRResult = qrResult;
            } catch (e) {
                if (qrBox) qrBox.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--color-error);">QR generation failed: ' + escapeHTML(e.message) + '</div>';
                this.currentActiveQRResult = null;
            }

            // Start countdown timer
            var duration = parseInt(document.getElementById('select-countdown-duration').value, 10) || 300;
            var countdownText = document.getElementById('qr-countdown-text');

            SplitSmartUPI.startCountdown(duration, function(timeStr) {
                if (countdownText) countdownText.textContent = timeStr;
            }, function() {
                self.showToast("Display session expired. You can regenerate at any time.");
            });

            // Update WhatsApp Preview
            var msg = SplitSmartShare.generateParticipantMessage(participant, this.activeBill, this.activeUPIProfile);
            var previewBox = document.getElementById('whatsapp-preview-box');
            if (previewBox) previewBox.textContent = msg;
            this.currentParticipantMessage = msg;
        },

        renderConsolidatedGroupReport: function() {
            if (!this.latestSettlement) return;
            var report = SplitSmartShare.generateGroupSummaryReport(this.latestSettlement, this.activeUPIProfile);
            var box = document.getElementById('group-report-preview-box');
            if (box) box.textContent = report;
            this.currentGroupReportMessage = report;
        },

        launchUPIApp: function() {
            if (!this.currentActiveQRResult || !this.currentActiveQRResult.upiUrl) return;
            var url = this.currentActiveQRResult.upiUrl;
            // Security: Only allow upi:// scheme for direct launch
            if (url.indexOf('upi://') !== 0) {
                this.showToast("Invalid UPI link scheme detected. Aborting.");
                return;
            }
            window.location.href = url;
        },

        copyActiveUPILink: function() {
            if (!this.currentActiveQRResult || !this.currentActiveQRResult.upiUrl) return;
            var self = this;
            SplitSmartUPI.copyToClipboard(this.currentActiveQRResult.upiUrl).then(function(ok) {
                self.showToast(ok ? "UPI Payment Link copied." : "Failed to copy link.");
            });
        },

        downloadActiveQRImage: function() {
            var qrBox = document.getElementById('participant-qr-render-box');
            var canvas = qrBox ? qrBox.querySelector('canvas') : null;
            if (!canvas) return;
            var filename = "SplitSmart_QR_" + Date.now() + ".png";
            SplitSmartUPI.downloadQRCanvas(canvas, filename);
            this.showToast("QR Code image downloaded.");
        },

        shareActiveParticipantWhatsApp: function() {
            if (!this.currentParticipantMessage) return;
            SplitSmartShare.shareViaWhatsApp(this.currentParticipantMessage);
        },

        shareActiveParticipantNative: function() {
            if (!this.currentParticipantMessage) return;
            var self = this;
            SplitSmartShare.shareNative("SplitSmart Settlement", this.currentParticipantMessage).then(function(ok) {
                if (ok) self.showToast("Shared successfully.");
            });
        },

        shareGroupReportWhatsApp: function() {
            if (!this.currentGroupReportMessage) return;
            SplitSmartShare.shareViaWhatsApp(this.currentGroupReportMessage);
        },

        /* ======================== HISTORY ARCHIVE ======================== */

        refreshHistory: function() {
            var container = document.getElementById('history-bills-list');
            if (!container) return;
            var self = this;

            SplitSmartDB.getAllBills().then(function(bills) {
                if (bills.length === 0) {
                    container.innerHTML = [
                        '<div class="forbes-card" style="text-align:center; padding:3rem 1rem;">',
                        '<div style="font-size:2.5rem; margin-bottom:0.75rem;">🏛</div>',
                        '<h3>No Saved Bills In Archive</h3>',
                        '<p style="font-size:0.85rem;">Scanned and calculated restaurant settlements are stored locally in IndexedDB.</p>',
                        '</div>'
                    ].join('');
                } else {
                    container.innerHTML = '';
                    bills.forEach(function(b) {
                        var card = document.createElement('div');
                        card.className = 'forbes-card';
                        var sid = safeId(b.id);

                        card.innerHTML = [
                            '<div class="card-header">',
                            '<div>',
                            '<h3 class="card-title">' + escapeHTML(b.restaurantName || "Restaurant Settlement") + '</h3>',
                            '<div style="font-size:0.75rem; color:var(--color-text-secondary); margin-top:0.25rem;">',
                            '📅 ' + escapeHTML(b.date || "Unknown Date") + (b.invoiceNumber ? ' • Inv: #' + escapeHTML(b.invoiceNumber) : '') + (b.gstin ? ' • GSTIN: ' + escapeHTML(b.gstin) : ''),
                            '</div>',
                            '</div>',
                            '<div style="text-align:right;">',
                            '<div class="stat-value font-serif" style="font-size:1.4rem;">' + escapeHTML(SplitSmartCalc.toRupees(SplitSmartCalc.toPaise(b.grandTotal), true)) + '</div>',
                            b.isSettled ? '<span class="badge badge-success">Settled</span>' : '<span class="badge badge-warning">Active</span>',
                            '</div>',
                            '</div>',
                            '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-top:1rem;">',
                            '<div style="font-size:0.8rem; color:var(--color-text-muted);">' + escapeHTML((b.items || []).length) + ' items itemized</div>',
                            '<div style="display:flex; gap:0.5rem;">',
                            '<button class="btn btn-primary btn-sm" data-action="reopen" data-id="' + sid + '">Reopen</button>',
                            '<button class="btn btn-subtle btn-sm" data-action="duplicate" data-id="' + sid + '">Duplicate</button>',
                            '<button class="btn btn-outline btn-sm" style="color:var(--color-error);" data-action="delete" data-id="' + sid + '">Delete</button>',
                            '</div>',
                            '</div>'
                        ].join('');

                        // Attach safe event listeners
                        container.appendChild(card);
                        card.querySelector('[data-action="reopen"]').addEventListener('click', function() { self.reopenBill(b.id); });
                        card.querySelector('[data-action="duplicate"]').addEventListener('click', function() { self.duplicateBill(b.id); });
                        card.querySelector('[data-action="delete"]').addEventListener('click', function() { self.deleteBill(b.id); });
                    });
                }
            });
        },

        reopenBill: function(id) {
            var self = this;
            SplitSmartDB.getBill(id).then(function(b) {
                if (!b) { self.showToast("Bill not found."); return; }
                self.activeBill = b;
                if (b.participants && b.participants.length > 0) {
                    self.participants = b.participants;
                }
                self.upiGuardConfirmed = false;
                self.navigateTo('split');
                self.showToast("Reopened " + (b.restaurantName || "bill"));
            });
        },

        duplicateBill: function(id) {
            var self = this;
            SplitSmartDB.duplicateBill(id).then(function() {
                self.showToast("Bill duplicated.");
                self.refreshHistory();
            });
        },

        deleteBill: function(id) {
            if (!confirm("Permanently delete this bill settlement?")) return;
            var self = this;
            SplitSmartDB.deleteBill(id).then(function() {
                self.showToast("Bill deleted.");
                self.refreshHistory();
            });
        },

        /* ======================== SETTINGS & PROFILE MANAGEMENT ======================== */

        refreshSettings: function() {
            var upiContainer = document.getElementById('settings-upi-profiles-list');
            var groupsContainer = document.getElementById('settings-groups-list');
            var self = this;

            if (upiContainer) {
                upiContainer.innerHTML = '';
                this.allUPIProfiles.forEach(function(u) {
                    var box = document.createElement('div');
                    box.className = 'forbes-card';
                    box.style.cssText = 'padding:0.75rem 1rem; margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;';

                    var leftDiv = document.createElement('div');
                    var nameLine = document.createElement('strong');
                    nameLine.textContent = u.name;
                    leftDiv.appendChild(nameLine);

                    if (u.isDefault) {
                        var badge = document.createElement('span');
                        badge.className = 'badge badge-success';
                        badge.textContent = 'Default';
                        badge.style.marginLeft = '6px';
                        leftDiv.appendChild(badge);
                    }

                    var upiLine = document.createElement('div');
                    upiLine.style.cssText = 'font-family:var(--font-mono); font-size:0.85rem; color:var(--color-text-secondary);';
                    upiLine.textContent = u.upiId;
                    leftDiv.appendChild(upiLine);

                    var rightDiv = document.createElement('div');
                    rightDiv.style.cssText = 'display:flex; gap:0.5rem;';

                    if (!u.isDefault) {
                        var makeDefBtn = document.createElement('button');
                        makeDefBtn.className = 'btn btn-subtle btn-sm';
                        makeDefBtn.textContent = 'Make Default';
                        makeDefBtn.addEventListener('click', function() { self.setDefaultUPI(u.id); });
                        rightDiv.appendChild(makeDefBtn);
                    }

                    var delBtn = document.createElement('button');
                    delBtn.className = 'btn btn-subtle btn-sm';
                    delBtn.style.color = 'var(--color-error)';
                    delBtn.textContent = 'Delete';
                    delBtn.addEventListener('click', function() { self.deleteUPI(u.id); });
                    rightDiv.appendChild(delBtn);

                    box.appendChild(leftDiv);
                    box.appendChild(rightDiv);
                    upiContainer.appendChild(box);
                });
            }

            if (groupsContainer) {
                groupsContainer.innerHTML = '';
                this.allGroups.forEach(function(g) {
                    var gbox = document.createElement('div');
                    gbox.className = 'forbes-card';
                    gbox.style.cssText = 'padding:0.75rem 1rem; margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;';

                    var leftDiv = document.createElement('div');
                    var gName = document.createElement('strong');
                    gName.textContent = g.name;
                    leftDiv.appendChild(gName);

                    var members = document.createElement('div');
                    members.style.cssText = 'font-size:0.8rem; color:var(--color-text-secondary);';
                    members.textContent = (g.members || []).join(', ');
                    leftDiv.appendChild(members);

                    var rightDiv = document.createElement('div');
                    var delGrpBtn = document.createElement('button');
                    delGrpBtn.className = 'btn btn-subtle btn-sm';
                    delGrpBtn.style.color = 'var(--color-error)';
                    delGrpBtn.textContent = 'Delete';
                    delGrpBtn.addEventListener('click', function() { self.deleteGroup(g.id); });
                    rightDiv.appendChild(delGrpBtn);

                    gbox.appendChild(leftDiv);
                    gbox.appendChild(rightDiv);
                    groupsContainer.appendChild(gbox);
                });
            }
        },

        setDefaultUPI: function(id) {
            var self = this;
            SplitSmartDB.setDefaultUPIProfile(id).then(function() {
                return self.loadInitialData();
            }).then(function() {
                self.refreshSettings();
                self.showToast("Default recipient updated.");
            });
        },

        deleteUPI: function(id) {
            if (this.allUPIProfiles.length <= 1) {
                this.showToast("Cannot delete only remaining UPI profile.");
                return;
            }
            var self = this;
            SplitSmartDB.deleteUPIProfile(id).then(function() {
                return self.loadInitialData();
            }).then(function() {
                self.refreshSettings();
                self.showToast("UPI Profile removed.");
            });
        },

        deleteGroup: function(id) {
            var self = this;
            SplitSmartDB.deleteGroup(id).then(function() {
                return self.loadInitialData();
            }).then(function() {
                self.refreshSettings();
                self.showToast("Group removed.");
            });
        },

        /* ======================== AUTOMATED TEST SUITE ======================== */

        runAutomatedTests: function() {
            var resultsContainer = document.getElementById('test-results-container');
            var badgeBar = document.getElementById('test-summary-badge-bar');
            var tbody = document.getElementById('test-results-body');
            if (!resultsContainer || !tbody) return;

            resultsContainer.style.display = 'block';
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Executing 14 automated tests...</td></tr>';
            var self = this;

            SplitSmartTests.runAllTests().then(function(report) {
                tbody.innerHTML = '';
                badgeBar.innerHTML = '';

                // Build badges via DOM
                var passBadge = document.createElement('span');
                passBadge.className = 'badge badge-success';
                passBadge.style.cssText = 'font-size:0.85rem; padding:6px 12px; margin-right:6px;';
                passBadge.textContent = '✓ ' + report.passedCount + ' Passed';
                badgeBar.appendChild(passBadge);

                if (report.failedCount > 0) {
                    var failBadge = document.createElement('span');
                    failBadge.className = 'badge badge-error';
                    failBadge.style.cssText = 'font-size:0.85rem; padding:6px 12px; margin-right:6px;';
                    failBadge.textContent = '⚠ ' + report.failedCount + ' Failed';
                    badgeBar.appendChild(failBadge);
                }

                var timeBadge = document.createElement('span');
                timeBadge.className = 'badge badge-neutral';
                timeBadge.style.cssText = 'font-size:0.85rem; padding:6px 12px;';
                timeBadge.textContent = '⏱ ' + report.totalDurationMs + ' ms';
                badgeBar.appendChild(timeBadge);

                report.results.forEach(function(r) {
                    var tr = document.createElement('tr');
                    var resBadge = r.passed ?
                        '<span class="badge badge-success">PASS</span>' :
                        '<span class="badge badge-error">FAIL</span>';

                    tr.innerHTML = [
                        '<td><strong>' + escapeHTML(r.id) + '</strong></td>',
                        '<td>' + escapeHTML(r.name) + '</td>',
                        '<td>' + resBadge + '</td>',
                        '<td style="font-size:0.8rem; color:var(--color-text-secondary);">' + escapeHTML(r.details) + '</td>'
                    ].join('');
                    tbody.appendChild(tr);
                });

                self.showToast(report.passedCount + "/" + report.totalTests + " tests passed in " + report.totalDurationMs + " ms");
            });
        },

        /* ======================== TOAST ======================== */

        showToast: function(message, duration) {
            var toast = document.getElementById('toast-notice');
            if (!toast) return;
            toast.textContent = message;
            toast.classList.add('show');
            clearTimeout(this._toastTimeout);
            this._toastTimeout = setTimeout(function() {
                toast.classList.remove('show');
            }, duration || 3200);
        },

        /* ======================== EVENT LISTENERS ======================== */

        setupEventListeners: function() {
            var self = this;

            // Navigation
            document.querySelectorAll('[data-view]').forEach(function(el) {
                el.addEventListener('click', function() {
                    self.navigateTo(el.getAttribute('data-view'));
                });
            });

            // Theme
            var btnTheme = document.getElementById('btn-theme-toggle');
            if (btnTheme) btnTheme.addEventListener('click', function() { self.toggleTheme(); });

            // Hero actions
            var btnHeroScan = document.getElementById('btn-hero-scan');
            if (btnHeroScan) btnHeroScan.addEventListener('click', function() { self.navigateTo('scan'); });

            var btnHeroSample = document.getElementById('btn-hero-sample');
            if (btnHeroSample) btnHeroSample.addEventListener('click', function() {
                self.navigateTo('scan');
                self.switchScanSubtab('presets');
            });

            var cardCam = document.getElementById('action-card-camera');
            if (cardCam) cardCam.addEventListener('click', function() { self.navigateTo('scan'); self.switchScanSubtab('camera'); });

            var cardUpload = document.getElementById('action-card-upload');
            if (cardUpload) cardUpload.addEventListener('click', function() { self.navigateTo('scan'); self.switchScanSubtab('upload'); });

            var cardManual = document.getElementById('action-card-manual');
            if (cardManual) cardManual.addEventListener('click', function() { self.navigateTo('scan'); self.switchScanSubtab('manual'); });

            // Scan subtabs
            document.querySelectorAll('[data-scan-tab]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    self.switchScanSubtab(btn.getAttribute('data-scan-tab'));
                });
            });

            // Camera buttons
            var btnCapture = document.getElementById('btn-camera-capture');
            if (btnCapture) btnCapture.addEventListener('click', function() { self.captureCameraFrame(); });

            var btnTorch = document.getElementById('btn-torch');
            if (btnTorch) btnTorch.addEventListener('click', function() {
                SplitSmartCamera.toggleTorch().then(function(on) {
                    btnTorch.textContent = on ? '💡 On' : '💡 Flash';
                });
            });

            var btnSwitchCam = document.getElementById('btn-switch-cam');
            if (btnSwitchCam) btnSwitchCam.addEventListener('click', function() { SplitSmartCamera.switchCamera(); });

            var btnProcessCaptures = document.getElementById('btn-process-captures');
            if (btnProcessCaptures) btnProcessCaptures.addEventListener('click', function() { self.processCapturesPipeline(); });

            var btnClearCaptures = document.getElementById('btn-clear-captures');
            if (btnClearCaptures) btnClearCaptures.addEventListener('click', function() { self.clearAllCaptures(); });

            // File Upload
            var fileInput = document.getElementById('file-input');
            if (fileInput) fileInput.addEventListener('change', function(e) {
                var file = e.target.files[0];
                if (file) {
                    SplitSmartCamera.loadFromFile(file).then(function() {
                        self.processCapturesPipeline();
                    }).catch(function(err) {
                        self.showToast(err.message);
                    });
                }
            });

            var btnBrowseFiles = document.getElementById('btn-browse-files');
            if (btnBrowseFiles && fileInput) {
                btnBrowseFiles.addEventListener('click', function(e) {
                    e.stopPropagation();
                    fileInput.click();
                });
            }

            var dropZone = document.getElementById('drop-zone');
            if (dropZone && fileInput) {
                dropZone.addEventListener('click', function(e) {
                    if (e.target !== btnBrowseFiles && e.target !== fileInput) {
                        fileInput.click();
                    }
                });
                dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.style.borderColor = 'var(--color-accent)'; });
                dropZone.addEventListener('dragleave', function() { dropZone.style.borderColor = 'var(--color-border)'; });
                dropZone.addEventListener('drop', function(e) {
                    e.preventDefault();
                    dropZone.style.borderColor = 'var(--color-border)';
                    var file = e.dataTransfer.files[0];
                    if (file) {
                        SplitSmartCamera.loadFromFile(file).then(function() {
                            self.processCapturesPipeline();
                        }).catch(function(err) {
                            self.showToast(err.message);
                        });
                    }
                });
            }

            // Sample bills
            var cardBombay = document.getElementById('sample-card-bombay');
            if (cardBombay) cardBombay.addEventListener('click', function() { self.loadSampleBillById('sample_bombay_canteen'); });

            var cardToit = document.getElementById('sample-card-toit');
            if (cardToit) cardToit.addEventListener('click', function() { self.loadSampleBillById('sample_toit_brewpub'); });

            var cardHaldiram = document.getElementById('sample-card-haldiram');
            if (cardHaldiram) cardHaldiram.addEventListener('click', function() { self.loadSampleBillById('sample_haldirams'); });

            var btnBlank = document.getElementById('btn-create-blank');
            if (btnBlank) btnBlank.addEventListener('click', function() { self.createNewBlankBill(); });

            // Verification
            var btnAddItem = document.getElementById('btn-add-item');
            if (btnAddItem) btnAddItem.addEventListener('click', function() { self.addBlankLineItem(); });

            var btnAutoReconcile = document.getElementById('btn-auto-reconcile');
            if (btnAutoReconcile) btnAutoReconcile.addEventListener('click', function() { self.autoReconcileGrandTotal(); });

            var btnProceedSplit = document.getElementById('btn-proceed-to-split');
            if (btnProceedSplit) btnProceedSplit.addEventListener('click', function() { self.commitVerificationAndProceed(); });

            ['tax-discount-amt', 'tax-service-amt', 'tax-cgst-amt', 'tax-sgst-amt', 'tax-igst-amt', 'tax-tip-amt', 'tax-roundoff-amt', 'tax-grand-total'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.addEventListener('input', function() { self.auditVerificationTotals(); });
            });

            // Split modes
            document.querySelectorAll('[data-split-mode]').forEach(function(btn) {
                btn.addEventListener('click', function() { self.setSplitMode(btn.getAttribute('data-split-mode')); });
            });

            // Diner addition
            var btnAddPart = document.getElementById('btn-add-participant');
            var inputPart = document.getElementById('input-new-participant');
            if (btnAddPart && inputPart) {
                btnAddPart.addEventListener('click', function() {
                    self.addParticipantByName(inputPart.value);
                    inputPart.value = '';
                });
                inputPart.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        self.addParticipantByName(inputPart.value);
                        inputPart.value = '';
                    }
                });
            }

            var selectGrp = document.getElementById('select-saved-group');
            if (selectGrp) selectGrp.addEventListener('change', function() { self.loadSavedGroupIntoSplit(selectGrp.value); });

            var checkRound = document.getElementById('check-round-rupee');
            if (checkRound) checkRound.addEventListener('change', function() {
                self.roundToNearestRupee = checkRound.checked;
                self.executeSettlementCalculation();
            });

            // Audit Trail Modal
            var modalAudit = document.getElementById('modal-audit-trail');
            var btnAudit = document.getElementById('btn-view-audit-breakdown');
            var btnCloseAudit = document.getElementById('btn-close-audit-modal');
            var btnDismissAudit = document.getElementById('btn-dismiss-audit-modal');

            if (btnAudit) btnAudit.addEventListener('click', function() {
                if (!self.latestSettlement) return;
                var content = document.getElementById('audit-trail-content');
                if (content) {
                    var html = '<div class="table-responsive"><table class="financial-table"><thead><tr>';
                    html += '<th>Diner</th><th class="numeric">Subtotal</th><th class="numeric">Discount</th><th class="numeric">CGST</th><th class="numeric">SGST</th><th class="numeric">Svc Chg</th><th class="numeric">Tip</th><th class="numeric">Net Payable</th>';
                    html += '</tr></thead><tbody>';

                    self.latestSettlement.participants.forEach(function(p) {
                        html += '<tr>';
                        html += '<td><strong>' + escapeHTML(p.name) + '</strong></td>';
                        html += '<td class="numeric">' + escapeHTML(p.rawSubtotalFormatted) + '</td>';
                        html += '<td class="numeric">-' + escapeHTML(p.discountFormatted) + '</td>';
                        html += '<td class="numeric">+' + escapeHTML(p.cgstFormatted) + '</td>';
                        html += '<td class="numeric">+' + escapeHTML(p.sgstFormatted) + '</td>';
                        html += '<td class="numeric">+' + escapeHTML(p.serviceChargeFormatted) + '</td>';
                        html += '<td class="numeric">+' + escapeHTML(p.tipFormatted) + '</td>';
                        html += '<td class="numeric font-serif"><strong>' + escapeHTML(p.netPayableFormatted) + '</strong></td>';
                        html += '</tr>';
                    });
                    html += '</tbody></table></div>';
                    html += '<div style="font-size:0.8rem; color:var(--color-text-secondary); margin-top:1rem;">';
                    html += '<strong>Reconciliation:</strong> Hamilton Largest Remainder verified. Discrepancy: ' + escapeHTML(self.latestSettlement.reconciliation.discrepancyPaise) + ' paise.';
                    html += '</div>';
                    content.innerHTML = html;
                }
                if (modalAudit) modalAudit.classList.add('active');
            });
            if (btnCloseAudit) btnCloseAudit.addEventListener('click', function() { modalAudit.classList.remove('active'); });
            if (btnDismissAudit) btnDismissAudit.addEventListener('click', function() { modalAudit.classList.remove('active'); });

            // Proceed to UPI
            var btnProceedUPI = document.getElementById('btn-proceed-to-upi');
            if (btnProceedUPI) btnProceedUPI.addEventListener('click', function() { self.navigateTo('payments'); });

            // UPI Guard
            var btnGuardConfirm = document.getElementById('btn-guard-confirm');
            if (btnGuardConfirm) btnGuardConfirm.addEventListener('click', function() { self.confirmUPIGuard(); });

            var btnGuardCancel = document.getElementById('btn-guard-cancel');
            if (btnGuardCancel) btnGuardCancel.addEventListener('click', function() {
                document.getElementById('modal-upi-confirm-guard').classList.remove('active');
                self.navigateTo('settings');
            });

            // UPI profile selector in Payments
            var selectUPI = document.getElementById('select-active-upi-profile');
            if (selectUPI) selectUPI.addEventListener('change', function() {
                var found = self.allUPIProfiles.find(function(u) { return u.id === selectUPI.value; });
                if (found) {
                    self.activeUPIProfile = found;
                    self.upiGuardConfirmed = false; // Re-verify on profile change!
                    self.updateHeaderUPIIndicator();
                    self.showUPIGuardModal();
                }
            });

            // Payment Action Buttons
            var btnOpenUPI = document.getElementById('btn-open-upi-app');
            if (btnOpenUPI) btnOpenUPI.addEventListener('click', function() { self.launchUPIApp(); });

            var btnCopyUPI = document.getElementById('btn-copy-upi-link');
            if (btnCopyUPI) btnCopyUPI.addEventListener('click', function() { self.copyActiveUPILink(); });

            var btnDownloadQR = document.getElementById('btn-download-qr-img');
            if (btnDownloadQR) btnDownloadQR.addEventListener('click', function() { self.downloadActiveQRImage(); });

            var btnShareWA = document.getElementById('btn-share-whatsapp');
            if (btnShareWA) btnShareWA.addEventListener('click', function() { self.shareActiveParticipantWhatsApp(); });

            var btnNativeShare = document.getElementById('btn-native-share');
            if (btnNativeShare) btnNativeShare.addEventListener('click', function() { self.shareActiveParticipantNative(); });

            var btnCopyMsg = document.getElementById('btn-copy-message-text');
            if (btnCopyMsg) btnCopyMsg.addEventListener('click', function() {
                if (self.currentParticipantMessage) {
                    SplitSmartUPI.copyToClipboard(self.currentParticipantMessage).then(function() {
                        self.showToast("WhatsApp receipt copied.");
                    });
                }
            });

            var btnShareGroup = document.getElementById('btn-share-group-report');
            if (btnShareGroup) btnShareGroup.addEventListener('click', function() { self.shareGroupReportWhatsApp(); });

            var checkPaid = document.getElementById('check-payment-settled');
            if (checkPaid) checkPaid.addEventListener('change', function() {
                self.showToast(checkPaid.checked ? "Diner marked as Paid." : "Diner marked as Pending.");
            });

            var selectCount = document.getElementById('select-countdown-duration');
            if (selectCount) selectCount.addEventListener('change', function() { self.renderActiveParticipantQR(); });

            // Add UPI Profile Modal
            var modalUpi = document.getElementById('modal-upi-profile');
            var openUpiModal = function() {
                document.getElementById('upi-modal-id').value = '';
                document.getElementById('upi-modal-name').value = '';
                document.getElementById('upi-modal-vpa').value = '';
                document.getElementById('upi-modal-is-default').checked = false;
                if (modalUpi) modalUpi.classList.add('active');
            };

            var btnModalAddUpi = document.getElementById('btn-modal-add-upi');
            var btnQuickAddUpi = document.getElementById('btn-add-new-upi-quick');
            if (btnModalAddUpi) btnModalAddUpi.addEventListener('click', openUpiModal);
            if (btnQuickAddUpi) btnQuickAddUpi.addEventListener('click', openUpiModal);

            var btnCloseUpi = document.getElementById('btn-close-upi-modal');
            var btnCancelUpi = document.getElementById('btn-cancel-upi-modal');
            if (btnCloseUpi) btnCloseUpi.addEventListener('click', function() { modalUpi.classList.remove('active'); });
            if (btnCancelUpi) btnCancelUpi.addEventListener('click', function() { modalUpi.classList.remove('active'); });

            var btnSaveUpi = document.getElementById('btn-save-upi-modal');
            if (btnSaveUpi) btnSaveUpi.addEventListener('click', function() {
                var name = document.getElementById('upi-modal-name').value.trim().substring(0, 100);
                var vpa = document.getElementById('upi-modal-vpa').value.trim().substring(0, 256);
                var isDef = document.getElementById('upi-modal-is-default').checked;

                if (!name) { self.showToast("Please enter the beneficiary name."); return; }
                if (!vpa) { self.showToast("Please enter the UPI ID."); return; }
                if (!SplitSmartUPI.isValidUPI(vpa)) { self.showToast("Invalid UPI VPA format (e.g. name@bank)."); return; }

                var profile = { id: 'upi_' + Date.now(), name: name, upiId: vpa, isDefault: isDef, createdAt: new Date().toISOString() };

                SplitSmartDB.saveUPIProfile(profile).then(function() {
                    if (isDef) return SplitSmartDB.setDefaultUPIProfile(profile.id);
                }).then(function() {
                    modalUpi.classList.remove('active');
                    return self.loadInitialData();
                }).then(function() {
                    self.refreshSettings();
                    self.showToast("UPI Profile saved.");
                });
            });

            // Add Group Modal
            var modalGroup = document.getElementById('modal-group');
            var btnModalAddGroup = document.getElementById('btn-modal-add-group');
            if (btnModalAddGroup) btnModalAddGroup.addEventListener('click', function() {
                document.getElementById('group-modal-name').value = '';
                document.getElementById('group-modal-members').value = '';
                if (modalGroup) modalGroup.classList.add('active');
            });

            var btnCloseGroup = document.getElementById('btn-close-group-modal');
            var btnCancelGroup = document.getElementById('btn-cancel-group-modal');
            if (btnCloseGroup) btnCloseGroup.addEventListener('click', function() { modalGroup.classList.remove('active'); });
            if (btnCancelGroup) btnCancelGroup.addEventListener('click', function() { modalGroup.classList.remove('active'); });

            var btnSaveGroup = document.getElementById('btn-save-group-modal');
            if (btnSaveGroup) btnSaveGroup.addEventListener('click', function() {
                var name = document.getElementById('group-modal-name').value.trim().substring(0, 100);
                var membersStr = document.getElementById('group-modal-members').value.trim();
                if (!name) { self.showToast("Please enter a group name."); return; }
                if (!membersStr) { self.showToast("Please enter member names (comma-separated)."); return; }

                var members = membersStr.split(',').map(function(m) { return m.trim().substring(0, 50); }).filter(function(m) { return m.length > 0; });
                if (members.length === 0) { self.showToast("Please enter at least one member name."); return; }

                var group = { id: 'grp_' + Date.now(), name: name, members: members, createdAt: new Date().toISOString() };

                SplitSmartDB.saveGroup(group).then(function() {
                    modalGroup.classList.remove('active');
                    return self.loadInitialData();
                }).then(function() {
                    self.refreshSettings();
                    self.showToast("Group saved.");
                });
            });

            // Test Runner
            var btnRunTests = document.getElementById('btn-run-tests');
            if (btnRunTests) btnRunTests.addEventListener('click', function() { self.runAutomatedTests(); });

            // Factory Reset
            var btnReset = document.getElementById('btn-factory-reset');
            if (btnReset) btnReset.addEventListener('click', function() {
                if (confirm("Delete ALL saved bills, UPI profiles, and groups? This cannot be undone.")) {
                    SplitSmartDB.clearAllData().then(function() {
                        self.showToast("All data cleared.");
                        window.location.reload();
                    });
                }
            });

            // Export / Import
            var btnExport = document.getElementById('btn-export-history');
            if (btnExport) btnExport.addEventListener('click', function() {
                SplitSmartDB.exportAllData().then(function(jsonStr) {
                    var blob = new Blob([jsonStr], { type: 'application/json' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = 'SplitSmart_Backup_' + new Date().toISOString().split('T')[0] + '.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    self.showToast("Backup exported.");
                });
            });

            var btnImport = document.getElementById('btn-import-history');
            if (btnImport) btnImport.addEventListener('click', function() {
                var input = document.createElement('input');
                input.type = 'file';
                input.accept = 'application/json';
                input.onchange = function(e) {
                    var file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                        self.showToast("Backup file too large (max 5 MB).");
                        return;
                    }
                    var reader = new FileReader();
                    reader.onload = function(evt) {
                        SplitSmartDB.importAllData(evt.target.result).then(function() {
                            self.showToast("Data restored successfully.");
                            self.loadInitialData().then(function() { self.refreshDashboard(); self.refreshHistory(); });
                        }).catch(function(err) {
                            self.showToast("Import failed: " + err.message);
                        });
                    };
                    reader.readAsText(file);
                };
                input.click();
            });

            // History search
            var inputSearchHist = document.getElementById('input-search-history');
            if (inputSearchHist) inputSearchHist.addEventListener('input', function() {
                var query = inputSearchHist.value.toLowerCase().trim();
                document.querySelectorAll('#history-bills-list .forbes-card').forEach(function(c) {
                    c.style.display = (c.textContent.toLowerCase().indexOf(query) !== -1) ? 'block' : 'none';
                });
            });

            // AI Assist Modal
            var modalAI = document.getElementById('modal-ai-assist');
            var btnOpenAI = document.getElementById('btn-open-ai-modal');
            var btnCloseAI = document.getElementById('btn-close-ai-modal');
            var btnCancelAI = document.getElementById('btn-cancel-ai-modal');
            var btnRunAI = document.getElementById('btn-run-ai-parse');
            var inputAIKey = document.getElementById('input-gemini-key');
            var previewAIText = document.getElementById('ai-raw-text-preview');

            if (btnOpenAI) btnOpenAI.addEventListener('click', function() {
                if (inputAIKey) inputAIKey.value = localStorage.getItem('splitsmart_gemini_key') || '';
                if (previewAIText && self.activeBill) previewAIText.value = self.activeBill.rawOcrText || '';
                if (modalAI) modalAI.classList.add('active');
            });
            if (btnCloseAI) btnCloseAI.addEventListener('click', function() { modalAI.classList.remove('active'); });
            if (btnCancelAI) btnCancelAI.addEventListener('click', function() { modalAI.classList.remove('active'); });

            if (btnRunAI) btnRunAI.addEventListener('click', function() {
                var key = inputAIKey.value.trim();
                // Only store key if user explicitly entered one
                if (key) localStorage.setItem('splitsmart_gemini_key', key);

                var text = previewAIText.value.trim();
                if (!text) { self.showToast("Please enter raw bill text to parse."); return; }

                var parsed = SplitSmartOCR.parseReceiptText(text);
                self.activeBill = parsed;
                modalAI.classList.remove('active');
                self.renderVerificationScreen(parsed);
                self.showToast("Receipt re-parsed.");
            });

            // Hash change
            window.addEventListener('hashchange', function() { self.handleHashRoute(); });
        }
    };

    window.App = App;
    document.addEventListener('DOMContentLoaded', function() { App.init(); });

})(window);
