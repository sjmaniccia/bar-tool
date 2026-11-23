// ===== invoice-scan.test.ts =====
// Checks the clean-up of what Claude reads off an invoice.

import { describe, expect, test } from "vitest";
import { cleanScan, packCount, toNumber } from "./invoice-scan";

describe("invoice scan clean-up", () => {
    test("money text becomes numbers", () => {
        expect(toNumber("$1,234.50")).toBe(1234.5);
        expect(toNumber("(12.00)")).toBe(-12);
        expect(toNumber("n/a")).toBeNull();
        expect(toNumber(7)).toBe(7);
    });

    test("a clean invoice has no warnings and fills missing prices", () => {
        const { invoice, warnings } = cleanScan({
            vendor_name: " Southern Glazer's ", invoice_number: "88213", invoice_date: "2026-11-20",
            lines: [
                { description: "BACARDI SUPERIOR 12/1L", sku: "10432", quantity: 1, unit: "case", unit_price: 210, line_total: 210, kind: "item" },
                { description: "LIMES 200CT", quantity: 2, line_total: 80, kind: "item" },
                { description: "KEG DEPOSIT", quantity: 1, unit_price: 30, kind: "fee" }
            ],
            subtotal: "$320.00", tax: 0, total: 320
        });
        expect(warnings).toEqual([]);
        expect(invoice.vendorName).toBe("Southern Glazer's");
        expect(invoice.lines[1].unitPrice).toBe(40);       // 80 / 2
        expect(invoice.lines[2].lineTotal).toBe(30);       // 1 × 30
        expect(invoice.lines[2].kind).toBe("fee");
    });

    test("bad math is flagged on the line and on the invoice", () => {
        const { invoice, warnings } = cleanScan({
            vendor_name: "RNDC", invoice_date: "Nov 20",
            lines: [{ description: "TEQUILA BLANCO 12/750", quantity: 2, unit_price: 300, line_total: 300, kind: "item" }],
            total: 650, tax: 0
        });
        expect(invoice.lines[0].warning).toMatch(/doesn't equal/);
        expect(warnings[0]).toMatch(/add up to \$300\.00 but the invoice says \$650\.00/);
        expect(invoice.invoiceDate).toBe("");               // unreadable date left blank
    });

    test("returns become negative credits", () => {
        const { invoice } = cleanScan({ vendor_name: "X", lines: [{ description: "BROKEN BOTTLE RETURN", quantity: 1, unit_price: 19, kind: "credit" }] });
        expect(invoice.lines[0]).toMatchObject({ quantity: -1, kind: "credit" });
    });

    test("split cases become a fraction of a case when the price is per case", () => {
        expect(packCount("12/1L")).toBe(12);
        const { invoice } = cleanScan({
            vendor_name: "SG", lines: [
                { description: "TITOS VODKA", pack_size: "12/1L", quantity: 0, bottles: 3, unit: "CS", unit_price: 252, line_total: 63, kind: "item" },
                { description: "CASAMIGOS BLANCO", pack_size: "6/750ML", quantity: 1, bottles: 2, unit: "CS", unit_price: 270, line_total: 360, kind: "item" }
            ]
        });
        expect(invoice.lines[0]).toMatchObject({ quantity: 0.25, bottles: 3, unitPrice: 252, lineTotal: 63, warning: "" });
        expect(invoice.lines[1]).toMatchObject({ quantity: 1.3333, unitPrice: 270, warning: "" });
    });

    test("loose bottles priced per bottle stay bottles", () => {
        const { invoice } = cleanScan({
            vendor_name: "SG", lines: [{ description: "APEROL", pack_size: "12/1L", quantity: 0, bottles: 2, unit: "CS", unit_price: 25, line_total: 50, kind: "item" }]
        });
        expect(invoice.lines[0]).toMatchObject({ quantity: 2, unit: "bottle", unitPrice: 25, lineTotal: 50 });
    });

    test("a 0 quantity with a charge is worked out from the money, with a warning", () => {
        const { invoice, warnings } = cleanScan({
            vendor_name: "SG", lines: [
                { description: "FERNET BRANCA 12/750", quantity: 0, unit: "CS", unit_price: 300, line_total: 75, kind: "item" },
                { description: "SPLIT CASE CHARGE", quantity: 0, line_total: 4, kind: "fee" }
            ], subtotal: 79
        });
        expect(invoice.lines[0]).toMatchObject({ quantity: 0.25, unitPrice: 300, lineTotal: 75 });
        expect(invoice.lines[0].warning).toMatch(/read as 0.*Entered as 0\.25/);
        expect(invoice.lines[1]).toMatchObject({ quantity: 1, unitPrice: 4, lineTotal: 4 });
        expect(warnings).toEqual([]);
    });
    test("keeps lines Claude marks as supplies", () => {
        const { invoice } = cleanScan({ vendor_name: "X", lines: [{ description: "BAR TOWELS 25 PK", quantity: 2, unit_price: 18, line_total: 36, kind: "supply" }] });
        expect(invoice.lines[0]).toMatchObject({ kind: "supply", quantity: 2 });
    });
});
