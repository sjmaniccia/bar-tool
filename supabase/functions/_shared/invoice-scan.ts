// ===== invoice-scan.ts =====
// What Claude is asked to pull off an invoice photo, and the clean-up after.
// No network in here, so the app's tests can check it.
//
// Claude is given a "tool" (record_invoice) whose shape it MUST fill in, so the answer
// always comes back as data, never as a paragraph. Then cleanScan():
//     turns "$1,234.50" into 1234.5, fills a missing price from the line total
//     IF a line's quantity x price doesn't match its total -> a warning on that line
//     IF the lines don't add up to the invoice's subtotal  -> a warning on the invoice
// Warnings don't block anything: they tell the manager where to look before approving.

export type LineKind = "item" | "fee" | "credit";

export interface ScannedLine {
    description: string;
    sku: string;
    quantity: number;
    unit: string;          // how it was sold: "case", "bottle", "each", "keg"...
    packSize: string;      // "12/750ML", as printed
    unitPrice: number | null;
    lineTotal: number | null;
    kind: LineKind;        // deposits and delivery charges are fees; returns are credits
    warning: string;
}

export interface ScannedInvoice {
    vendorName: string;
    invoiceNumber: string;
    invoiceDate: string;   // "2026-11-21", or "" if unreadable
    lines: ScannedLine[];
    subtotal: number | null;
    tax: number | null;
    total: number | null;
}

export const INVOICE_TOOL = {
    name: "record_invoice",
    description: "Record every line of a supplier invoice exactly as printed.",
    input_schema: {
        type: "object",
        properties: {
            vendor_name: { type: "string", description: "The supplier's company name at the top of the invoice" },
            invoice_number: { type: "string" },
            invoice_date: { type: "string", description: "YYYY-MM-DD" },
            lines: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        description: { type: "string", description: "Product name as printed, including brand and size" },
                        sku: { type: "string", description: "Item or product code, if printed" },
                        quantity: { type: "number", description: "How many units shipped (negative for returns or credits)" },
                        unit: { type: "string", description: "What one unit is: case, bottle, each, keg, lb..." },
                        pack_size: { type: "string", description: "Pack size as printed, e.g. 12/750ML or 6/1L" },
                        unit_price: { type: "number", description: "Price for ONE unit, before tax" },
                        line_total: { type: "number", description: "Extended price for the line" },
                        kind: { type: "string", enum: ["item", "fee", "credit"], description: "fee = deposits, delivery, fuel or other charges; credit = returns" }
                    },
                    required: ["description", "quantity", "kind"]
                }
            },
            subtotal: { type: "number" },
            tax: { type: "number" },
            total: { type: "number" }
        },
        required: ["vendor_name", "lines"]
    }
};

export const INSTRUCTIONS = [
    "These photos are pages of one supplier invoice for a bar or restaurant (liquor, beer, wine, food or supplies).",
    "Call record_invoice with EVERY line item, in order, across all pages. Don't skip, merge or invent lines.",
    "Copy product names, item codes and pack sizes exactly as printed.",
    "quantity is the number of units shipped. unit is what one unit is (often a case). unit_price is for one unit.",
    "If a line was crossed out or marked as not delivered (out of stock), leave it out.",
    "If a number is unreadable, leave that field out rather than guessing."
].join(" ");

// "$1,234.50" -> 1234.5, "(12.00)" -> -12, junk -> null
export function toNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const negative = /^\s*\(.*\)\s*$/.test(value) || /^\s*-/.test(value);
    const digits = value.replace(/[^0-9.]/g, "");
    if (digits === "" || Number.isNaN(Number(digits))) return null;
    return negative ? -Number(digits) : Number(digits);
}

const round = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => "$" + n.toFixed(2);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function cleanScan(raw: unknown): { invoice: ScannedInvoice; warnings: string[] } {
    const r = (raw ?? {}) as Record<string, unknown>;
    const warnings: string[] = [];

    const lines: ScannedLine[] = [];
    for (const item of Array.isArray(r.lines) ? r.lines : []) {
        const l = (item ?? {}) as Record<string, unknown>;
        const description = text(l.description);
        let quantity = toNumber(l.quantity) ?? 1;
        let unitPrice = toNumber(l.unit_price);
        let lineTotal = toNumber(l.line_total);
        if (description === "" && unitPrice === null && lineTotal === null) continue;
        // Fill in whichever money number is missing from the other
        if (unitPrice === null && lineTotal !== null && quantity !== 0) unitPrice = round(lineTotal / quantity);
        if (lineTotal === null && unitPrice !== null) lineTotal = round(quantity * unitPrice);
        let warning = "";
        if (unitPrice !== null && lineTotal !== null && Math.abs(quantity * unitPrice - lineTotal) > 0.02) {
            warning = quantity + " × " + money(unitPrice) + " doesn't equal " + money(lineTotal) + ". Check the quantity and price.";
        }
        const kindText = text(l.kind);
        const kind: LineKind = kindText === "fee" || kindText === "credit" ? kindText : quantity < 0 ? "credit" : "item";
        if (kind === "credit" && quantity > 0) quantity = -quantity;
        lines.push({
            description, sku: text(l.sku), quantity, unit: text(l.unit), packSize: text(l.pack_size),
            unitPrice, lineTotal, kind, warning
        });
    }

    const subtotal = toNumber(r.subtotal);
    const tax = toNumber(r.tax);
    const total = toNumber(r.total);
    const sum = round(lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0));
    const expected = subtotal ?? (total !== null ? round(total - (tax ?? 0)) : null);
    if (expected !== null && Math.abs(sum - expected) > 0.05) {
        warnings.push("The lines add up to " + money(sum) + " but the invoice says " + money(expected) + ". A line may be missing or misread.");
    }
    if (lines.length === 0) warnings.push("No lines could be read. Try a sharper, flatter photo in good light.");

    const date = text(r.invoice_date);
    return {
        invoice: {
            vendorName: text(r.vendor_name),
            invoiceNumber: text(r.invoice_number),
            invoiceDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
            lines, subtotal, tax, total
        },
        warnings
    };
}
