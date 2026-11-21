// ===== invoice-scan.test.ts =====
// Checks the clean-up of what Claude reads off an invoice.

import { describe, expect, test } from "vitest";
import { cleanScan, toNumber } from "./invoice-scan";

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
});
