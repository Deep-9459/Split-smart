/**
 * SplitSmart - Realistic Indian Restaurant Sample Bills
 * For instantaneous verification, demonstration, and automated test cases
 */

(function(window) {
    'use strict';

    var SAMPLE_BILLS = [
        {
            id: 'sample_bombay_canteen',
            restaurantName: 'The Bombay Canteen',
            location: 'Lower Parel, Mumbai',
            gstin: '27AABCT8921M1Z4',
            invoiceNumber: 'BC/2026/1108',
            date: '2026-11-08',
            time: '21:45',
            items: [
                { id: 'i1', name: 'Chettinad Pulled Pork', qty: 2, price: 450.00, confidence: 0.98 },
                { id: 'i2', name: 'White Pea & Pumpkin Curry', qty: 1, price: 420.00, confidence: 0.95 },
                { id: 'i3', name: 'Butter Garlic Naan', qty: 4, price: 90.00, confidence: 0.97 },
                { id: 'i4', name: 'Red Wine Sangria Pitcher', qty: 1, price: 1200.00, confidence: 0.99 },
                { id: 'i5', name: 'Gulab Nut Dessert', qty: 2, price: 280.00, confidence: 0.94 },
                { id: 'i6', name: 'Mineral Water Himalayan', qty: 2, price: 100.00, confidence: 0.99 }
            ],
            subtotal: 3640.00,
            discountAmount: 364.00,
            discountNote: 'Corporate Privilege 10%',
            serviceChargeAmount: 327.60,
            serviceChargeRate: 10,
            cgstAmount: 81.90,
            cgstRate: 2.5,
            sgstAmount: 81.90,
            sgstRate: 2.5,
            igstAmount: 0.00,
            tipAmount: 0.00,
            otherChargesAmount: 0.10, // Round-off
            grandTotal: 3767.50,
            rawOcrText: [
                "THE BOMBAY CANTEEN",
                "Unit 1, Process House, Kamala Mills, Lower Parel, Mumbai 400013",
                "GSTIN: 27AABCT8921M1Z4  Tel: 022-49666666",
                "Date: 08/11/2026  Time: 21:45  Table: T14",
                "Bill No: BC/2026/1108  Server: Rajesh",
                "--------------------------------------------------",
                "ITEM NAME                        QTY   RATE     AMOUNT",
                "--------------------------------------------------",
                "Chettinad Pulled Pork              2   450.00   900.00",
                "White Pea & Pumpkin Curry          1   420.00   420.00",
                "Butter Garlic Naan                 4    90.00   360.00",
                "Red Wine Sangria Pitcher           1  1200.00  1200.00",
                "Gulab Nut Dessert                  2   280.00   560.00",
                "Mineral Water Himalayan            2   100.00   200.00",
                "--------------------------------------------------",
                "SUB TOTAL:                                     3640.00",
                "DISCOUNT (10% Corp Privilege):                 -364.00",
                "SERVICE CHARGE (10%):                           327.60",
                "CGST @ 2.5%:                                     81.90",
                "SGST @ 2.5%:                                     81.90",
                "ROUND OFF:                                        0.10",
                "==================================================",
                "GRAND TOTAL (INR):                            3767.50",
                "==================================================",
                "Thank you for dining with us! Please visit again."
            ].join('\n')
        },
        {
            id: 'sample_toit_brewpub',
            restaurantName: 'Toit Brewpub',
            location: 'Indiranagar, Bengaluru',
            gstin: '29AAACP4512N1Z9',
            invoiceNumber: 'TT/BLR/8941',
            date: '2026-11-08',
            time: '20:15',
            items: [
                { id: 't1', name: 'Tint-in-Wit Craft Beer Pitcher', qty: 2, price: 850.00, confidence: 0.99 },
                { id: 't2', name: 'Toit Baked Nachos Grande', qty: 2, price: 360.00, confidence: 0.96 },
                { id: 't3', name: 'Wood Fired Pepperoni Pizza', qty: 1, price: 620.00, confidence: 0.98 },
                { id: 't4', name: 'BBQ Chicken Wings (8 pcs)', qty: 2, price: 410.00, confidence: 0.95 },
                { id: 't5', name: 'Classic Margherita Pizza', qty: 1, price: 480.00, confidence: 0.96 }
            ],
            subtotal: 4340.00,
            discountAmount: 651.00,
            discountNote: 'Happy Hours 15%',
            serviceChargeAmount: 276.68,
            serviceChargeRate: 7.5,
            cgstAmount: 92.23,
            cgstRate: 2.5,
            sgstAmount: 92.23,
            sgstRate: 2.5,
            igstAmount: 0.00,
            tipAmount: 0.00,
            otherChargesAmount: 0.00,
            grandTotal: 4150.14,
            rawOcrText: [
                "TOIT BREWPUB - BENGALURU",
                "298, 100 Feet Road, Indiranagar, Bengaluru 560038",
                "GSTIN: 29AAACP4512N1Z9",
                "TAX INVOICE: TT/BLR/8941  Date: 08-11-2026",
                "Time: 20:15  Diners: 4",
                "--------------------------------------------------",
                "ITEM                             QTY   RATE     TOTAL",
                "--------------------------------------------------",
                "Tint-in-Wit Craft Beer Pitcher     2   850.00  1700.00",
                "Toit Baked Nachos Grande           2   360.00   720.00",
                "Wood Fired Pepperoni Pizza         1   620.00   620.00",
                "BBQ Chicken Wings (8 pcs)          2   410.00   820.00",
                "Classic Margherita Pizza           1   480.00   480.00",
                "--------------------------------------------------",
                "FOOD & BEV SUBTOTAL:                           4340.00",
                "HAPPY HOURS DISCOUNT 15%:                      -651.00",
                "SERVICE CHARGE @ 7.5%:                          276.68",
                "CGST @ 2.5%:                                     92.23",
                "SGST @ 2.5%:                                     92.23",
                "==================================================",
                "TOTAL AMOUNT:                                  4150.14",
                "=================================================="
            ].join('\n')
        },
        {
            id: 'sample_haldirams',
            restaurantName: "Haldiram's Sweets & Restaurant",
            location: 'Connaught Place, New Delhi',
            gstin: '07AAACH2345K1Z8',
            invoiceNumber: 'HLD-DEL-401',
            date: '2026-11-08',
            time: '14:30',
            items: [
                { id: 'h1', name: 'Special Chhole Bhature', qty: 2, price: 180.00, confidence: 0.98 },
                { id: 'h2', name: 'Delhi Special Raj Kachori', qty: 2, price: 140.00, confidence: 0.97 },
                { id: 'h3', name: 'Amritsari Pav Bhaji', qty: 1, price: 190.00, confidence: 0.99 },
                { id: 'h4', name: 'Kesar Rasmalai (2 Pcs)', qty: 2, price: 120.00, confidence: 0.95 },
                { id: 'h5', name: 'Special Masala Chai', qty: 3, price: 45.00, confidence: 0.96 }
            ],
            subtotal: 1205.00,
            discountAmount: 0.00,
            serviceChargeAmount: 0.00,
            cgstAmount: 30.13,
            cgstRate: 2.5,
            sgstAmount: 30.13,
            sgstRate: 2.5,
            igstAmount: 0.00,
            tipAmount: 0.00,
            otherChargesAmount: 0.00,
            grandTotal: 1265.26,
            rawOcrText: [
                "HALDIRAM'S SWEETS & RESTAURANT",
                "B-1, Inner Circle, Connaught Place, New Delhi 110001",
                "GSTIN: 07AAACH2345K1Z8",
                "CASH MEMO: HLD-DEL-401  Date: 08/11/2026 14:30",
                "--------------------------------------------------",
                "ITEM DESCRIPTION                 QTY   PRICE    AMOUNT",
                "--------------------------------------------------",
                "Special Chhole Bhature             2   180.00   360.00",
                "Delhi Special Raj Kachori          2   140.00   280.00",
                "Amritsari Pav Bhaji                1   190.00   190.00",
                "Kesar Rasmalai (2 Pcs)             2   120.00   240.00",
                "Special Masala Chai                3    45.00   135.00",
                "--------------------------------------------------",
                "SUB TOTAL:                                     1205.00",
                "CGST @ 2.5%:                                     30.13",
                "SGST @ 2.5%:                                     30.13",
                "==================================================",
                "NET PAYABLE:                                   1265.26",
                "=================================================="
            ].join('\n')
        }
    ];

    window.SplitSmartSamples = {
        getAll: function() { return SAMPLE_BILLS; },
        getById: function(id) {
            return SAMPLE_BILLS.find(function(b) { return b.id === id; }) || SAMPLE_BILLS[0];
        }
    };

})(window);
