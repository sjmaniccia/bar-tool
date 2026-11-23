// ===== invoice-scan.ts =====
// What Claude is asked to pull off an invoice photo, and the clean-up after.
// No network in here, so the app's tests can check it.
//
// Claude is given a "tool" (record_invoice) whose shape it MUST fill in, so the answer
// always comes back as data, never as a paragraph. Then cleanScan():
//     turns "$1,234.50" into 1234.5, fills a missing price from the line total
//     split cases: 0 cases + 3 bottles of a 12-pack at $252 a case -> 0.25 case
//     IF the quantity still reads 0 but the line charges money -> work it out from the money
//     IF a line's quantity x price doesn't match its total -> a warning on that line
//     IF the lines don't add up to the invoice's subtotal  -> a warning on the invoice
// Warnings don't block anything: they tell the manager where to look before approving.

export type LineKind = "item" | "supply" | "fee" | "credit";    // supply = bought, but never eaten or drunk

export interface ScannedLine {
    description: string;
    sku: string;
    quantity: number;      // in the price's unit; a split case is a fraction (3 of 12 = 0.25)
    bottles?: number;      // loose bottles on a split-case line, as printed (for showing)
    unit: string;          // how it was sold: "case", "bottle", "each", "keg"...
    packSize: string;      // "12/750ML", as printed
    unitPrice: number | null;
    lineTotal: number | null;
    kind: LineKind;        // deposits and delivery charges are fees; returns are credits
    warning: string;
    zeroQuantity?: boolean; // printed as 0 but charged: often a service or subscription
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
                        quantity: { type: "number", description: "How many units (usually full cases) shipped. Negative for returns or credits." },
                        bottles: { type: "number", description: "Loose bottles or units shipped, when the invoice has a separate bottle/unit column next to cases (a split case). Leave out if there's no such column." },
                        unit: { type: "string", description: "What one unit is: case, bottle, each, keg, lb..." },
                        pack_size: { type: "string", description: "Pack size as printed, e.g. 12/750ML or 6/1L" },
                        unit_price: { type: "number", description: "Price for ONE unit, before tax" },
                        line_total: { type: "number", description: "Extended price for the line" },
                        kind: { type: "string", enum: ["item", "supply", "fee", "credit"], description: "item = food or drink (anything that could go into a recipe or be sold); supply = goods that are not food or drink: paper goods, napkins, straws, to-go containers, cleaning chemicals, mop heads, bar towels, linens, toilet paper, gloves, trash bags, glassware, smallwares, uniforms; fee = deposits, delivery, fuel or other charges; credit = returns" }
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
    "Many distributor invoices have separate columns for cases and bottles (or units). Put full cases in quantity and loose bottles in bottles.",
    "A line showing 0 cases with bottles shipped, or 0 quantity but a charge, is a real charge: include it with the numbers as printed.",
    "Mark food and drink as item. Mark anything that is not food or drink (paper goods, cleaning supplies, mop heads, bar towels, toilet paper, glassware, smallwares) as supply.",
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
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const close = (a: number, b: number) => Math.abs(a - b) <= 0.02;

// "12/1L" or "6/750ML" -> 12 or 6 (how many bottles in a case), else null
export function packCount(text: string): number | null {
    const match = text.match(/\b(\d+)\s*\/\s*\d/);
    const count = match ? Number(match[1]) : null;
    return count && count > 1 ? count : null;
}

// What was actually charged for, in the unit the price is for.
//     IF there are loose bottles (a split case):
//         price per case? (cases + bottles/pack) x price = total -> a fraction of a case
//         price per bottle? (only bottles, bottles x price = total) -> bottles
//     IF the quantity is still 0 but the line charges money -> total / price (or 1 at the total)
// Returns the quantity, unit and price to use, and a warning when it had to guess.
export function chargedQuantity(cases: number, bottles: number, pack: number | null, unit: string,
    unitPrice: number | null, lineTotal: number | null): { quantity: number; unit: string; unitPrice: number | null; warning: string } {
    let quantity = cases;
    if (bottles !== 0) {
        const asCases = pack ? cases + bottles / pack : null;
        if (asCases !== null && unitPrice !== null && lineTotal !== null && close(asCases * unitPrice, lineTotal)) {
            return { quantity: round4(asCases), unit, unitPrice, warning: "" };
        }
        if (cases === 0 && (unitPrice === null || lineTotal === null || close(bottles * unitPrice, lineTotal))) {
            return { quantity: bottles, unit: "bottle", unitPrice: unitPrice ?? (lineTotal !== null ? round(lineTotal / bottles) : null), warning: "" };
        }
        quantity = asCases !== null ? round4(asCases) : cases + bottles;
    }
    if (quantity === 0 && lineTotal !== null && lineTotal !== 0) {
        if (unitPrice !== null && unitPrice !== 0) {
            const worked = round4(lineTotal / unitPrice);
            return { quantity: worked, unit, unitPrice, warning: "Quantity read as 0, but the line charges " + money(lineTotal) + ". Entered as " + worked + ". Check it." };
        }
        return { quantity: 1, unit, unitPrice: lineTotal, warning: "Quantity read as 0, but the line charges " + money(lineTotal) + ". Entered as 1 at that price. Check it." };
    }
    return { quantity, unit, unitPrice, warning: "" };
}
const money = (n: number) => "$" + n.toFixed(2);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function cleanScan(raw: unknown): { invoice: ScannedInvoice; warnings: string[] } {
    const r = (raw ?? {}) as Record<string, unknown>;
    const warnings: string[] = [];

    const lines: ScannedLine[] = [];
    for (const item of Array.isArray(r.lines) ? r.lines : []) {
        const l = (item ?? {}) as Record<string, unknown>;
        const description = text(l.description);
        const bottles = toNumber(l.bottles) ?? 0;
        const cases = toNumber(l.quantity) ?? (bottles !== 0 ? 0 : 1);
        let unitPrice = toNumber(l.unit_price);
        let lineTotal = toNumber(l.line_total);
        if (description === "" && unitPrice === null && lineTotal === null) continue;
        const charged = chargedQuantity(cases, bottles, packCount(text(l.pack_size) + " " + description), text(l.unit), unitPrice, lineTotal);
        let quantity = charged.quantity;
        unitPrice = charged.unitPrice;
        // Fill in whichever money number is missing from the other
        if (unitPrice === null && lineTotal !== null && quantity !== 0) unitPrice = round(lineTotal / quantity);
        if (lineTotal === null && unitPrice !== null) lineTotal = round(quantity * unitPrice);
        let warning = charged.warning;
        if (warning === "" && unitPrice !== null && lineTotal !== null && Math.abs(quantity * unitPrice - lineTotal) > 0.02) {
            warning = quantity + " × " + money(unitPrice) + " doesn't equal " + money(lineTotal) + ". Check the quantity and price.";
        }
        const kindText = text(l.kind);
        const kind: LineKind = kindText === "fee" || kindText === "credit" || kindText === "supply" ? kindText : quantity < 0 ? "credit" : "item";
        if (kind === "credit" && quantity > 0) quantity = -quantity;
        lines.push({
            description, sku: text(l.sku), quantity, ...(bottles !== 0 ? { bottles } : {}), unit: charged.unit, packSize: text(l.pack_size),
            unitPrice, lineTotal, kind, warning, ...(cases === 0 && bottles === 0 && charged.warning !== "" ? { zeroQuantity: true } : {})
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
