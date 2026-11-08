/**
 * SplitSmart - IndexedDB & Local Storage Manager
 * Persistent storage for Bill History, UPI Profiles, Participant Groups, and User Preferences
 */

(function(window) {
    'use strict';

    var DB_NAME = 'SplitSmartDB';
    var DB_VERSION = 1;

    var SplitSmartDB = {
        db: null,

        /**
         * Strip HTML tags and limit string length (anti-XSS sanitizer for imported data)
         * @param {*} val 
         * @param {number} maxLen 
         * @returns {string}
         */
        sanitizeString: function(val, maxLen) {
            if (val === undefined || val === null) return '';
            var str = String(val);
            // Strip any HTML tags
            str = str.replace(/<[^>]*>/g, '');
            // Strip dangerous characters for onclick injection
            str = str.replace(/['"\\]/g, '');
            return str.substring(0, maxLen || 500).trim();
        },

        /**
         * Initialize IndexedDB and create object stores
         * @returns {Promise<IDBDatabase>}
         */
        init: function() {
            var self = this;
            if (self.db) {
                return Promise.resolve(self.db);
            }
            return new Promise(function(resolve, reject) {
                if (!window.indexedDB) {
                    console.warn("IndexedDB not supported, falling back to LocalStorage.");
                    self.seedDefaults().then(function() { resolve(null); });
                    return;
                }

                var resolved = false;
                var fallbackTimer = setTimeout(function() {
                    if (!resolved) {
                        resolved = true;
                        console.warn("IndexedDB initialization timed out; active fallback enabled.");
                        self.seedDefaults().then(function() { resolve(null); });
                    }
                }, 800);

                try {
                    var request = indexedDB.open(DB_NAME, DB_VERSION);

                    request.onupgradeneeded = function(e) {
                        var db = e.target.result;

                        // Bills Store
                        if (!db.objectStoreNames.contains('bills')) {
                            var billStore = db.createObjectStore('bills', { keyPath: 'id' });
                            billStore.createIndex('date', 'date', { unique: false });
                            billStore.createIndex('restaurantName', 'restaurantName', { unique: false });
                            billStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                        }

                        // UPI Profiles Store
                        if (!db.objectStoreNames.contains('upi_profiles')) {
                            var upiStore = db.createObjectStore('upi_profiles', { keyPath: 'id' });
                            upiStore.createIndex('isDefault', 'isDefault', { unique: false });
                        }

                        // Saved Participant Groups Store
                        if (!db.objectStoreNames.contains('saved_groups')) {
                            var groupStore = db.createObjectStore('saved_groups', { keyPath: 'id' });
                            groupStore.createIndex('name', 'name', { unique: false });
                        }
                    };

                    request.onsuccess = function(e) {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(fallbackTimer);
                        self.db = e.target.result;
                        // Seed initial data if empty
                        self.seedDefaults().then(function() {
                            resolve(self.db);
                        });
                    };

                    request.onerror = function(e) {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(fallbackTimer);
                        console.warn("IndexedDB error; falling back to LocalStorage:", e.target ? e.target.error : e);
                        self.seedDefaults().then(function() { resolve(null); });
                    };
                } catch (ex) {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(fallbackTimer);
                    console.warn("IndexedDB exception; falling back to LocalStorage:", ex);
                    self.seedDefaults().then(function() { resolve(null); });
                }
            });
        },

        /**
         * Seed default UPI profile and sample groups on first launch
         */
        seedDefaults: function() {
            var self = this;
            return this.getUPIProfiles().then(function(profiles) {
                if (!profiles || profiles.length === 0) {
                    var defaultProfile = {
                        id: 'upi_' + Date.now(),
                        name: 'Deep Jhaveri',
                        upiId: 'deep@okhdfcbank',
                        isDefault: true,
                        createdAt: new Date().toISOString()
                    };
                    return self.saveUPIProfile(defaultProfile);
                }
            }).then(function() {
                return self.getGroups();
            }).then(function(groups) {
                if (!groups || groups.length === 0) {
                    var group1 = {
                        id: 'grp_1',
                        name: 'Office Lunch Gang',
                        members: ['Deep', 'Rohan', 'Priya', 'Ananya'],
                        createdAt: new Date().toISOString()
                    };
                    var group2 = {
                        id: 'grp_2',
                        name: 'Weekend Diners',
                        members: ['Deep', 'Aditya', 'Sameer', 'Pooja', 'Vikram'],
                        createdAt: new Date().toISOString()
                    };
                    return Promise.all([self.saveGroup(group1), self.saveGroup(group2)]);
                }
            }).catch(function(err) {
                console.warn("Seeding defaults warning:", err);
            });
        },

        /* ======================== BILL OPERATIONS ======================== */

        /**
         * Save or update a bill calculation
         * @param {Object} bill 
         * @returns {Promise<Object>}
         */
        saveBill: function(bill) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!bill.id) {
                    bill.id = 'bill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                }
                bill.updatedAt = new Date().toISOString();
                if (!bill.createdAt) bill.createdAt = bill.updatedAt;

                if (!self.db) {
                    try {
                        var bills = JSON.parse(localStorage.getItem('splitsmart_bills') || '[]');
                        var idx = bills.findIndex(function(b) { return b.id === bill.id; });
                        if (idx !== -1) bills[idx] = bill;
                        else bills.unshift(bill);
                        localStorage.setItem('splitsmart_bills', JSON.stringify(bills));
                        resolve(bill);
                    } catch(e) { reject(e); }
                    return;
                }

                var tx = self.db.transaction('bills', 'readwrite');
                var store = tx.objectStore('bills');
                var req = store.put(bill);

                req.onsuccess = function() { resolve(bill); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        /**
         * Retrieve a bill by ID
         * @param {string} id 
         * @returns {Promise<Object>}
         */
        getBill: function(id) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!self.db) {
                    try {
                        var bills = JSON.parse(localStorage.getItem('splitsmart_bills') || '[]');
                        var found = bills.find(function(b) { return b.id === id; });
                        resolve(found || null);
                    } catch(e) { reject(e); }
                    return;
                }

                var tx = self.db.transaction('bills', 'readonly');
                var store = tx.objectStore('bills');
                var req = store.get(id);

                req.onsuccess = function() { resolve(req.result || null); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        /**
         * Get all bills sorted newest first
         * @returns {Promise<Array<Object>>}
         */
        getAllBills: function() {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!self.db) {
                    try {
                        var bills = JSON.parse(localStorage.getItem('splitsmart_bills') || '[]');
                        resolve(bills);
                    } catch(e) { reject(e); }
                    return;
                }

                var tx = self.db.transaction('bills', 'readonly');
                var store = tx.objectStore('bills');
                var req = store.getAll();

                req.onsuccess = function() {
                    var bills = req.result || [];
                    bills.sort(function(a, b) {
                        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
                    });
                    resolve(bills);
                };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        /**
         * Delete a bill by ID
         * @param {string} id 
         * @returns {Promise<boolean>}
         */
        deleteBill: function(id) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!self.db) {
                    try {
                        var bills = JSON.parse(localStorage.getItem('splitsmart_bills') || '[]');
                        bills = bills.filter(function(b) { return b.id !== id; });
                        localStorage.setItem('splitsmart_bills', JSON.stringify(bills));
                        resolve(true);
                    } catch(e) { reject(e); }
                    return;
                }

                var tx = self.db.transaction('bills', 'readwrite');
                var store = tx.objectStore('bills');
                var req = store.delete(id);

                req.onsuccess = function() { resolve(true); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        /**
         * Duplicate an existing bill
         * @param {string} id 
         * @returns {Promise<Object>}
         */
        duplicateBill: function(id) {
            var self = this;
            return this.getBill(id).then(function(original) {
                if (!original) throw new Error("Bill not found to duplicate");
                var clone = JSON.parse(JSON.stringify(original));
                clone.id = 'bill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                clone.restaurantName = (clone.restaurantName || "Bill") + " (Copy)";
                clone.createdAt = new Date().toISOString();
                clone.updatedAt = clone.createdAt;
                return self.saveBill(clone);
            });
        },

        /* ======================== UPI PROFILES ======================== */

        /**
         * Get all saved UPI profiles
         * @returns {Promise<Array<Object>>}
         */
        getUPIProfiles: function() {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!self.db) {
                    try {
                        var list = JSON.parse(localStorage.getItem('splitsmart_upi_profiles') || '[]');
                        resolve(list);
                    } catch(e) { reject(e); }
                    return;
                }

                var tx = self.db.transaction('upi_profiles', 'readonly');
                var store = tx.objectStore('upi_profiles');
                var req = store.getAll();

                req.onsuccess = function() { resolve(req.result || []); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        /**
         * Save or update UPI Profile
         * @param {Object} profile 
         * @returns {Promise<Object>}
         */
        saveUPIProfile: function(profile) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!profile.id) {
                    profile.id = 'upi_' + Date.now();
                }

                if (!self.db) {
                    try {
                        var list = JSON.parse(localStorage.getItem('splitsmart_upi_profiles') || '[]');
                        var idx = list.findIndex(function(p) { return p.id === profile.id; });
                        if (idx !== -1) list[idx] = profile;
                        else list.push(profile);
                        localStorage.setItem('splitsmart_upi_profiles', JSON.stringify(list));
                        resolve(profile);
                    } catch(e) { reject(e); }
                    return;
                }

                var tx = self.db.transaction('upi_profiles', 'readwrite');
                var store = tx.objectStore('upi_profiles');
                var req = store.put(profile);

                req.onsuccess = function() { resolve(profile); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        /**
         * Delete UPI Profile
         * @param {string} id 
         * @returns {Promise<boolean>}
         */
        deleteUPIProfile: function(id) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!self.db) {
                    try {
                        var list = JSON.parse(localStorage.getItem('splitsmart_upi_profiles') || '[]');
                        list = list.filter(function(p) { return p.id !== id; });
                        localStorage.setItem('splitsmart_upi_profiles', JSON.stringify(list));
                        resolve(true);
                    } catch(e) { reject(e); }
                    return;
                }

                var tx = self.db.transaction('upi_profiles', 'readwrite');
                var store = tx.objectStore('upi_profiles');
                var req = store.delete(id);

                req.onsuccess = function() { resolve(true); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        /**
         * Set default UPI Profile
         * @param {string} id 
         * @returns {Promise<void>}
         */
        setDefaultUPIProfile: function(id) {
            var self = this;
            return this.getUPIProfiles().then(function(profiles) {
                var promises = profiles.map(function(p) {
                    p.isDefault = (p.id === id);
                    return self.saveUPIProfile(p);
                });
                return Promise.all(promises);
            });
        },

        /* ======================== GROUPS OPERATIONS ======================== */

        /**
         * Get all saved participant groups
         * @returns {Promise<Array<Object>>}
         */
        getGroups: function() {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!self.db) {
                    try {
                        var list = JSON.parse(localStorage.getItem('splitsmart_saved_groups') || '[]');
                        resolve(list);
                    } catch(e) { reject(e); }
                    return;
                }

                var tx = self.db.transaction('saved_groups', 'readonly');
                var store = tx.objectStore('saved_groups');
                var req = store.getAll();

                req.onsuccess = function() { resolve(req.result || []); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        /**
         * Save or update participant group
         * @param {Object} group 
         * @returns {Promise<Object>}
         */
        saveGroup: function(group) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!group.id) group.id = 'grp_' + Date.now();

                if (!self.db) {
                    try {
                        var list = JSON.parse(localStorage.getItem('splitsmart_saved_groups') || '[]');
                        var idx = list.findIndex(function(g) { return g.id === group.id; });
                        if (idx !== -1) list[idx] = group;
                        else list.push(group);
                        localStorage.setItem('splitsmart_saved_groups', JSON.stringify(list));
                        resolve(group);
                    } catch(e) { reject(e); }
                    return;
                }

                var tx = self.db.transaction('saved_groups', 'readwrite');
                var store = tx.objectStore('saved_groups');
                var req = store.put(group);

                req.onsuccess = function() { resolve(group); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        /**
         * Delete participant group
         * @param {string} id 
         * @returns {Promise<boolean>}
         */
        deleteGroup: function(id) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!self.db) {
                    try {
                        var list = JSON.parse(localStorage.getItem('splitsmart_saved_groups') || '[]');
                        list = list.filter(function(g) { return g.id !== id; });
                        localStorage.setItem('splitsmart_saved_groups', JSON.stringify(list));
                        resolve(true);
                    } catch(e) { reject(e); }
                    return;
                }

                var tx = self.db.transaction('saved_groups', 'readwrite');
                var store = tx.objectStore('saved_groups');
                var req = store.delete(id);

                req.onsuccess = function() { resolve(true); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        /* ======================== BACKUP & RESTORE ======================== */

        /**
         * Export entire database to JSON string
         * @returns {Promise<string>}
         */
        exportAllData: function() {
            var self = this;
            return Promise.all([
                self.getAllBills(),
                self.getUPIProfiles(),
                self.getGroups()
            ]).then(function(results) {
                var backup = {
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    app: "SplitSmart",
                    initiative: "Deep Jhaveri",
                    data: {
                        bills: results[0],
                        upiProfiles: results[1],
                        groups: results[2],
                        preferences: {
                            theme: localStorage.getItem('splitsmart_theme') || 'light',
                            roundToNearestRupee: localStorage.getItem('splitsmart_round_rupee') === 'true'
                        }
                    }
                };
                return JSON.stringify(backup, null, 2);
            });
        },

        /**
         * Import database from JSON string
         * @param {string} jsonString 
         * @returns {Promise<boolean>}
         */
        importAllData: function(jsonString) {
            var self = this;
            return new Promise(function(resolve, reject) {
                try {
                    var parsed = JSON.parse(jsonString);
                    if (!parsed.data || typeof parsed.data !== 'object') throw new Error("Invalid backup format: missing 'data' object");

                    // Validate schema version
                    if (parsed.version && parsed.version > 1) {
                        throw new Error("Unsupported backup version: " + parsed.version);
                    }

                    var bills = Array.isArray(parsed.data.bills) ? parsed.data.bills : [];
                    var upiProfiles = Array.isArray(parsed.data.upiProfiles) ? parsed.data.upiProfiles : [];
                    var groups = Array.isArray(parsed.data.groups) ? parsed.data.groups : [];

                    // Sanitize imported bills
                    bills = bills.filter(function(b) {
                        return b && typeof b === 'object' && typeof b.id === 'string' && b.id.length < 200;
                    }).map(function(b) {
                        b.restaurantName = SplitSmartDB.sanitizeString(b.restaurantName, 200);
                        b.invoiceNumber = SplitSmartDB.sanitizeString(b.invoiceNumber, 100);
                        b.gstin = SplitSmartDB.sanitizeString(b.gstin, 20);
                        b.location = SplitSmartDB.sanitizeString(b.location, 200);
                        b.grandTotal = typeof b.grandTotal === 'number' ? b.grandTotal : parseFloat(b.grandTotal) || 0;
                        if (Array.isArray(b.items)) {
                            b.items = b.items.map(function(item) {
                                item.name = SplitSmartDB.sanitizeString(item.name, 200);
                                item.qty = typeof item.qty === 'number' ? item.qty : parseInt(item.qty) || 1;
                                item.price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
                                return item;
                            });
                        }
                        if (Array.isArray(b.participants)) {
                            b.participants = b.participants.map(function(p) {
                                p.name = SplitSmartDB.sanitizeString(p.name, 100);
                                return p;
                            });
                        }
                        return b;
                    });

                    // Sanitize imported UPI profiles
                    upiProfiles = upiProfiles.filter(function(u) {
                        return u && typeof u === 'object' && typeof u.upiId === 'string' && u.upiId.length < 300;
                    }).map(function(u) {
                        u.name = SplitSmartDB.sanitizeString(u.name, 100);
                        u.upiId = SplitSmartDB.sanitizeString(u.upiId, 256);
                        u.isDefault = !!u.isDefault;
                        return u;
                    });

                    // Sanitize imported groups
                    groups = groups.filter(function(g) {
                        return g && typeof g === 'object' && typeof g.id === 'string';
                    }).map(function(g) {
                        g.name = SplitSmartDB.sanitizeString(g.name, 100);
                        if (Array.isArray(g.members)) {
                            g.members = g.members.map(function(m) { return SplitSmartDB.sanitizeString(m, 100); });
                        }
                        return g;
                    });

                    var billPromises = bills.map(function(b) { return self.saveBill(b); });
                    var upiPromises = upiProfiles.map(function(u) { return self.saveUPIProfile(u); });
                    var groupPromises = groups.map(function(g) { return self.saveGroup(g); });

                    Promise.all([].concat(billPromises, upiPromises, groupPromises)).then(function() {
                        if (parsed.data.preferences && typeof parsed.data.preferences === 'object') {
                            var themeVal = parsed.data.preferences.theme;
                            if (themeVal === 'light' || themeVal === 'dark') {
                                localStorage.setItem('splitsmart_theme', themeVal);
                            }
                            if (parsed.data.preferences.roundToNearestRupee !== undefined) {
                                localStorage.setItem('splitsmart_round_rupee', parsed.data.preferences.roundToNearestRupee ? 'true' : 'false');
                            }
                        }
                        resolve(true);
                    }).catch(reject);
                } catch (e) {
                    reject(e);
                }
            });
        },

        /**
         * Factory reset: clear all IndexedDB stores and LocalStorage
         * @returns {Promise<boolean>}
         */
        clearAllData: function() {
            var self = this;
            return new Promise(function(resolve, reject) {
                localStorage.removeItem('splitsmart_bills');
                localStorage.removeItem('splitsmart_upi_profiles');
                localStorage.removeItem('splitsmart_saved_groups');
                localStorage.removeItem('splitsmart_theme');
                localStorage.removeItem('splitsmart_round_rupee');

                if (!self.db) {
                    self.seedDefaults().then(function() { resolve(true); });
                    return;
                }

                var tx = self.db.transaction(['bills', 'upi_profiles', 'saved_groups'], 'readwrite');
                tx.objectStore('bills').clear();
                tx.objectStore('upi_profiles').clear();
                tx.objectStore('saved_groups').clear();

                tx.oncomplete = function() {
                    self.seedDefaults().then(function() {
                        resolve(true);
                    });
                };
                tx.onerror = function(e) { reject(e.target.error); };
            });
        }
    };

    window.SplitSmartDB = SplitSmartDB;

})(window);
