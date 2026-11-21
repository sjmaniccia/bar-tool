// ===== invoiceScan.test.ts =====
// Checks matching a scanned invoice to the sample bar's vendors and products,
// remembering matches, and making new products from unmatched lines.

import { beforeEach, describe, expect, test } from "vitest";
import { db } from "./storage";
import { sampleData } from "./sampleData";
import {
    addUnmatchedAsProducts, buildDraft, createInvoiceFromDraft, createProductFromLine, guessFamily, matchLine,
    matchVendor, packFromText, productName, vendorDisplayName, words, type ScannedInvoice, type ScannedLine
} from "./invoiceScan";

beforeEach(() => {
    Object.assign(db, sampleData());
});

function line(description: string, more: Partial<ScannedLine> = {}): ScannedLine {
    return {
        description, sku: "", quantity: 1, unit: "CS", packSize: "", unitPrice: 200, lineTotal: 200,
        kind: "item", warning: "", ...more
    };
}

describe("words", () => {
    test("turns sizes into ml so 1L and 1000ml compare equal", () => {
        expect(words("ISLAND WHITE RUM 1L")).toContain("1000ml");
        expect(words("Rum 1.0 LTR")).toContain("1000ml");
        expect(words("Tequila 750ML")).toContain("750ml");
    });
});

describe("vendor", () => {
    test("matches the printed name, ignoring filler words", () => {
        expect(matchVendor("SOUTHERN GLAZER'S WINE & SPIRITS OF TN, LLC")).toBe("v-sg");
        expect(matchVendor("RNDC Inc.")).toBe("v-rndc");
        expect(matchVendor("Valley Produce Co")).toBe("v-produce");
    });

    test("returns nothing for a vendor we don't have", () => {
        expect(matchVendor("Breakthru Beverage")).toBeNull();
    });
});

describe("lines", () => {
    test("suggests a product by name and size, and picks the case for a case line", () => {
        const match = matchLine(line("ISLAND WHITE RUM 12/1L"), "v-sg");
        expect(match).toEqual({ purchaseUnitId: "pu-rum-case", how: "suggested" });
    });

    test("picks the single bottle for a bottle line", () => {
        const match = matchLine(line("Island White Rum 1L", { unit: "BTL" }), "v-rndc");
        expect(match.purchaseUnitId).toBe("pu-rum-single");
    });

    test("matches by item code", () => {
        expect(matchLine(line("LKOUT VLY LGR 1/2BBL", { sku: "LVL-HALF" }), "v-sg").how).toBe("code");
    });

    test("leaves an unknown item unmatched", () => {
        expect(matchLine(line("BLUE CURACAO 12/1L"), "v-sg").how).toBe("none");
    });

    test("remembers a match for the next invoice from the same vendor", () => {
        // Too abbreviated to guess the first time
        const scan: ScannedInvoice = {
            vendorName: "Southern Glazer's", invoiceNumber: "A-1", invoiceDate: "2026-11-20",
            lines: [line("ISL WHT RUM", { sku: "88213" })], subtotal: 200, tax: 0, total: 200
        };
        const first = buildDraft(scan);
        expect(first.lines[0].how).toBe("none");
        first.lines[0].purchaseUnitId = "pu-rum-case";
        createInvoiceFromDraft(first);

        const second = buildDraft({ ...scan, invoiceNumber: "A-2" });
        expect(second.lines[0]).toMatchObject({ purchaseUnitId: "pu-rum-case", how: "remembered" });
    });
});

describe("creating the invoice", () => {
    test("adds matched lines, skips fees, and notes what was left out", () => {
        const scan: ScannedInvoice = {
            vendorName: "SOUTHERN GLAZERS", invoiceNumber: "778812", invoiceDate: "2026-11-20",
            lines: [
                line("ISLAND WHITE RUM 12/1L", { quantity: 2, unitPrice: 215, lineTotal: 430 }),
                line("FUEL SURCHARGE", { kind: "fee", unitPrice: 4.5, lineTotal: 4.5, unit: "" })
            ],
            subtotal: 434.5, tax: 0, total: 434.5
        };
        const draft = buildDraft(scan);
        expect(draft.vendorId).toBe("v-sg");
        expect(draft.lines[1].skip).toBe(true);

        const id = createInvoiceFromDraft(draft);
        const invoice = db.invoices.find((i) => i.id === id)!;
        expect(invoice).toMatchObject({ vendorId: "v-sg", number: "778812", invoiceDate: "2026-11-20", status: "unreconciled" });
        expect(invoice.note).toContain("FUEL SURCHARGE");
        const lines = db.invoiceLines.filter((l) => l.invoiceId === id);
        expect(lines).toEqual([expect.objectContaining({ purchaseUnitId: "pu-rum-case", quantity: 2, unitPrice: 215 })]);
    });

    test("adds a new vendor when the printed one isn't on file", () => {
        const draft = buildDraft({
            vendorName: "Breakthru Beverage", invoiceNumber: "1", invoiceDate: "2026-11-20",
            lines: [], subtotal: 0, tax: 0, total: 0
        });
        const id = createInvoiceFromDraft(draft);
        const vendorId = db.invoices.find((i) => i.id === id)!.vendorId;
        expect(db.vendors.find((v) => v.id === vendorId)?.companyName).toBe("Breakthru Beverage");
    });
});

describe("new products from lines", () => {
    test("reads pack sizes", () => {
        expect(packFromText("BLUE CURACAO 12/1L")).toMatchObject({ unitsPer: 12, size: 1000, unit: "ml" });
        expect(packFromText("CAB SAUV 6/750ML")).toMatchObject({ unitsPer: 6, size: 750, unit: "ml" });
        expect(packFromText("HAZY IPA 1/2BBL")).toMatchObject({ unitsPer: 1, size: 15.5, unit: "gal", packaging: "keg" });
        expect(packFromText("LIMES 200CT")).toMatchObject({ unitsPer: 200, unit: "each" });
    });

    test("guesses the family and tidies the name", () => {
        expect(guessFamily("BLUE CURACAO LIQUEUR 12/1L")).toBe("Spirits");
        expect(guessFamily("HAZY IPA 1/2BBL")).toBe("Beer");
        expect(guessFamily("NAPKINS")).toBe("Other");
        expect(productName(line("BLUE CURACAO LIQUEUR 12/1L"))).toBe("Blue Curacao Liqueur");
        expect(productName(line("TITO'S HANDMADE VODKA 12/1L"))).toBe("Tito's Handmade Vodka");
        expect(guessFamily("CASAMIGOS BLANCO 6/750ML")).toBe("Spirits");
    });

    test("creates the product, bottle and case, with the price and item code", () => {
        const unitId = createProductFromLine(line("BLUE CURACAO LIQUEUR 12/1L", { sku: "55120", unitPrice: 96 }), "v-sg")!;
        const unit = db.purchaseUnits.find((u) => u.id === unitId)!;
        expect(unit).toMatchObject({ vendorId: "v-sg", unitAmount: 12, sku: "55120" });
        const format = db.formats.find((f) => f.id === unit.formatId)!;
        expect(format).toMatchObject({ unitSize: 1000, sizeUnit: "ml" });
        expect(db.products.find((p) => p.id === format.productId)?.name).toBe("Blue Curacao Liqueur");
    });
});

describe("filling in a new bar from an invoice", () => {
    test("tidies the printed vendor name", () => {
        expect(vendorDisplayName("SOUTHERN GLAZER'S WINE & SPIRITS OF TN, LLC")).toBe("Southern Glazer's Wine & Spirits of TN");
        expect(vendorDisplayName("Breakthru Beverage Inc.")).toBe("Breakthru Beverage");
        expect(vendorDisplayName("RNDC")).toBe("RNDC");
    });

    test("adds the vendor and every unmatched item in one go, then remembers them", () => {
        const scan: ScannedInvoice = {
            vendorName: "BREAKTHRU BEVERAGE TENNESSEE, LLC", invoiceNumber: "B-1", invoiceDate: "2026-11-20",
            lines: [
                line("BLUE CURACAO LIQUEUR 12/1L", { unitPrice: 96 }),
                line("HAZY IPA 1/2BBL", { unit: "EA", unitPrice: 185 }),
                line("DELIVERY FEE", { kind: "fee", unitPrice: 10 })
            ],
            subtotal: 291, tax: 0, total: 291
        };
        const before = db.products.length;
        const { draft, added } = addUnmatchedAsProducts(buildDraft(scan));
        expect(added).toBe(2);
        expect(db.products.length).toBe(before + 2);
        expect(db.vendors.find((v) => v.id === draft.vendorId)?.companyName).toBe("Breakthru Beverage Tennessee");
        expect(draft.lines[2].purchaseUnitId).toBeNull();

        createInvoiceFromDraft(draft);
        const again = buildDraft({ ...scan, invoiceNumber: "B-2" });
        expect(again.vendorId).toBe(draft.vendorId);
        expect(again.lines.slice(0, 2).map((l) => l.how)).toEqual(["remembered", "remembered"]);
        expect(db.vendors.filter((v) => v.companyName.startsWith("Breakthru"))).toHaveLength(1);
    });
});
