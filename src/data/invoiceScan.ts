// ===== invoiceScan.ts =====
// Turns what Claude read off an invoice photo into an Agave invoice.
//
//     VENDOR   match the printed name to a vendor ("SOUTHERN GLAZER'S WINE & SPIRITS"
//              -> "Southern Glazer's"), or offer to add it
//     LINES    for each line, find the product it is, in this order:
//                1. REMEMBERED: this vendor's line was matched before (by item code or name)
//                2. CODE: the item code equals a purchase unit's SKU
//                3. SUGGESTED: the product's name words appear in the line, with a size bonus
//              Fees (deposits, fuel) and credits (returns) start out skipped
//     CREATE   a draft invoice with the matched lines, and remember every match, so the
//              next invoice from this vendor matches itself. Approving it (on the invoice
//              page) records the new prices and shows which recipe costs moved.
//
// A line with no match can also become a NEW product, made from its name and pack size,
// so a bar's first few scanned invoices build its product library for it.

import { db, commit } from "./storage";
import { findById, makeId } from "./utils";
import { buyName, createVendor, FAMILIES } from "./library";
import { importProductRows, type ProductRow } from "./backup";
import type { PurchaseUnit } from "./types";
import type { ScannedInvoice, ScannedLine } from "../../supabase/functions/_shared/invoice-scan";

export type { ScannedInvoice, ScannedLine };

export type MatchHow = "remembered" | "code" | "suggested" | "picked" | "none";    // picked = by the manager

export interface DraftLine {
    scanned: ScannedLine;
    purchaseUnitId: string | null;
    how: MatchHow;
    skip: boolean;
    quantity: number;
    unitPrice: number;
}

export interface Draft {
    vendorId: string | null;     // null = new vendor named vendorName
    vendorName: string;
    number: string;
    date: string;
    lines: DraftLine[];
}


// ===== Words =====

// Words that say nothing about which vendor or product it is
const VENDOR_FILLER = new Set(["inc", "llc", "co", "company", "corp", "of", "the", "and", "wine", "spirits", "beverage", "beverages", "distributing", "distributors", "distribution", "group", "ltd"]);
const PRODUCT_FILLER = new Set(["the", "and", "of", "cs", "case", "btl", "bottle", "ea", "each", "pk", "pack"]);

// "ISLAND WHITE RUM 12/1L" -> ["island", "white", "rum", "12", "1000ml"]
//     sizes become ml so "1L", "1.0 LTR" and a 1000 ml format all compare equal
export function words(text: string): string[] {
    const out: string[] = [];
    const cleaned = text.toLowerCase().replace(/[’']/g, "").replace(/(\d)\s+(ml|l|ltr|lt|oz)\b/g, "$1$2");
    for (const raw of cleaned.split(/[^a-z0-9.]+/)) {
        const w = raw.replace(/^\.+|\.+$/g, "");
        if (w === "") continue;
        const size = w.match(/^(\d+(?:\.\d+)?)(ml|l|ltr|lt)$/);
        out.push(size ? Math.round(Number(size[1]) * (size[2] === "ml" ? 1 : 1000)) + "ml" : w);
    }
    return out;
}

function sizeWord(unitSize: number, sizeUnit: string): string | null {
    if (sizeUnit === "ml") return Math.round(unitSize) + "ml";
    if (sizeUnit === "L") return Math.round(unitSize * 1000) + "ml";
    return null;
}


// ===== Vendor =====

// The vendor whose name words best overlap the printed name (at least half of them)
export function matchVendor(printed: string): string | null {
    const mine = words(printed).filter((w) => !VENDOR_FILLER.has(w));
    if (mine.length === 0) return null;
    let best: { id: string; score: number } | null = null;
    for (const vendor of db.vendors) {
        const theirs = words(vendor.companyName).filter((w) => !VENDOR_FILLER.has(w));
        if (theirs.length === 0) continue;
        const shared = theirs.filter((w) => mine.includes(w)).length;
        const score = shared / Math.min(theirs.length, mine.length);
        if (score >= 0.5 && (best === null || score > best.score)) best = { id: vendor.id, score };
    }
    return best?.id ?? null;
}


// ===== Lines =====

// How a line is remembered: by its item code when there is one, else by its words
export function lineKey(line: ScannedLine): string {
    return line.sku ? "sku:" + line.sku.toLowerCase() : "desc:" + words(line.description).join(" ");
}

// How well a purchase unit fits a line, 0 to about 1.3
//     share of the product's name words found in the line (the main signal)
//     + 0.2 IF the bottle size is in the line, + 0.1 IF the case size is ("12/1L" and a case of 12)
export function fitScore(line: ScannedLine, unit: PurchaseUnit): number {
    const format = findById(db.formats, unit.formatId);
    const product = findById(db.products, format?.productId ?? null);
    if (!format || !product) return 0;
    const lineWords = words(line.description + " " + line.packSize);
    const nameWords = words(product.name).filter((w) => !PRODUCT_FILLER.has(w));
    if (nameWords.length === 0) return 0;
    let score = nameWords.filter((w) => lineWords.includes(w)).length / nameWords.length;
    const size = sizeWord(format.unitSize, format.sizeUnit);
    if (size && lineWords.includes(size)) score += 0.2;
    const pack = (line.description + " " + line.packSize).match(/\b(\d+)\s*\//);
    if (pack && Number(pack[1]) === unit.unitAmount) score += 0.1;
    // "case" on the invoice should land on a case, "bottle"/"each" on a single
    const unitText = line.unit.toLowerCase();
    if (/case|cs/.test(unitText) && unit.unitAmount === 1) score -= 0.15;
    if (/bottle|btl|each|ea/.test(unitText) && unit.unitAmount > 1) score -= 0.15;
    return score;
}

export function matchLine(line: ScannedLine, vendorId: string | null): { purchaseUnitId: string | null; how: MatchHow } {
    const key = lineKey(line);
    if (vendorId) {
        const link = db.invoiceItemLinks.find((l) => l.vendorId === vendorId && l.key === key);
        if (link && findById(db.purchaseUnits, link.purchaseUnitId)) return { purchaseUnitId: link.purchaseUnitId, how: "remembered" };
    }
    if (line.sku) {
        const sku = line.sku.toLowerCase();
        const bySku = db.purchaseUnits.filter((u) => u.sku && u.sku.toLowerCase() === sku);
        const pick = bySku.find((u) => u.vendorId === vendorId) ?? bySku[0];
        if (pick) return { purchaseUnitId: pick.id, how: "code" };
    }
    // This vendor's products first; any vendor's if none fit
    const pools = [db.purchaseUnits.filter((u) => vendorId && u.vendorId === vendorId), db.purchaseUnits];
    for (const pool of pools) {
        let best: { id: string; score: number } | null = null;
        for (const unit of pool) {
            const score = fitScore(line, unit);
            if (score >= 0.6 && (best === null || score > best.score)) best = { id: unit.id, score };
        }
        if (best) return { purchaseUnitId: best.id, how: "suggested" };
    }
    return { purchaseUnitId: null, how: "none" };
}

// Everything matched as well as it can be, ready for the manager to check
export function buildDraft(scan: ScannedInvoice): Draft {
    const vendorId = matchVendor(scan.vendorName);
    return {
        vendorId,
        vendorName: scan.vendorName,
        number: scan.invoiceNumber,
        date: scan.invoiceDate,
        lines: scan.lines.map((line) => {
            const match = line.kind === "item" ? matchLine(line, vendorId) : { purchaseUnitId: null, how: "none" as MatchHow };
            return {
                scanned: line,
                ...match,
                skip: line.kind !== "item",
                quantity: line.quantity,
                unitPrice: line.unitPrice ?? 0
            };
        })
    };
}

// Re-match after the manager picks a different vendor (remembered links are per vendor)
//     lines the manager picked by hand stay as they are
export function rematch(draft: Draft, vendorId: string | null): Draft {
    return {
        ...draft,
        vendorId,
        lines: draft.lines.map((l) => (l.scanned.kind === "item" && l.how !== "picked" && !l.skip
            ? { ...l, ...matchLine(l.scanned, vendorId) }
            : l))
    };
}


// ===== New product from a line =====

// "12/1L" -> a case of 12 one-liter bottles; "6/750ML" -> 6 x 750 ml; "1/2BBL" -> a half-barrel keg
export function packFromText(text: string): { unitsPer: number; size: number; unit: string; packaging: string } {
    const t = text.toUpperCase();
    const keg = t.match(/1\/2\s*BBL|HALF\s*BBL/) ? 0.5 : t.match(/1\/4\s*BBL|1\/6\s*BBL/) ? (t.includes("1/4") ? 0.25 : 1 / 6) : null;
    if (keg !== null) return { unitsPer: 1, size: Math.round(keg * 31 * 100) / 100, unit: "gal", packaging: "keg" };
    const pack = t.match(/(\d+)\s*\/\s*(\d+(?:\.\d+)?)\s*(ML|L|LTR|LT|OZ)\b/);
    if (pack) {
        const amount = Number(pack[2]);
        const liquid = pack[3] === "OZ"
            ? { size: amount, unit: "fl oz" }
            : { size: pack[3] === "ML" ? amount : amount * 1000, unit: "ml" };
        return { unitsPer: Number(pack[1]), ...liquid, packaging: pack[3] === "OZ" ? "can" : "bottle" };
    }
    const single = t.match(/(\d+(?:\.\d+)?)\s*(ML|L|LTR|LT)\b/);
    if (single) return { unitsPer: 1, size: single[2] === "ML" ? Number(single[1]) : Number(single[1]) * 1000, unit: "ml", packaging: "bottle" };
    const count = t.match(/(\d+)\s*(CT|COUNT)\b/);
    if (count) return { unitsPer: Number(count[1]), size: 1, unit: "each", packaging: "each" };
    return { unitsPer: 1, size: 1, unit: "each", packaging: "each" };
}

const FAMILY_WORDS: [string, RegExp][] = [
    ["Beer", /\b(beer|lager|ale|ipa|stout|pilsner|porter|seltzer|cider|keg|bbl)\b/i],
    ["Wine", /\b(wine|cabernet|cab|merlot|pinot|chardonnay|chard|sauvignon|riesling|rose|prosecco|champagne|cava|malbec|zinfandel|blend)\b/i],
    ["Spirits", /\b(rum|vodka|gin|tequila|mezcal|whiskey|whisky|bourbon|rye|scotch|brandy|cognac|liqueur|vermouth|amaro|aperol|campari|bitters|schnapps|triple sec)\b/i],
    ["Produce", /\b(lime|limes|lemon|lemons|orange|oranges|mint|grapefruit|berries|cucumber|jalapeno)\b/i],
    ["Non-alcoholic", /\b(soda|tonic|juice|syrup|ginger beer|cola|water|puree|mixer)\b/i]
];

export function guessFamily(description: string): string {
    const hit = FAMILY_WORDS.find(([, pattern]) => pattern.test(description));
    return hit && FAMILIES.includes(hit[0]) ? hit[0] : "Other";
}

// "ISLAND WHITE RUM 12/1L" -> "Island White Rum"
export function productName(line: ScannedLine): string {
    const name = line.description
        .replace(/\b\d+\s*\/\s*\d+(\.\d+)?\s*(ML|L|LTR|LT|OZ)\b/gi, "")
        .replace(/\b\d+(\.\d+)?\s*(ML|L|LTR|LT)\b/gi, "")
        .replace(/\b1\/[246]\s*BBL\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    return name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) || line.description;
}

// Make a product, size and way-to-buy from a line, through the same code as the
// spreadsheet import (so it's tested), and return the new purchase unit's id
export function createProductFromLine(line: ScannedLine, vendorId: string): string | null {
    const vendor = findById(db.vendors, vendorId);
    if (!vendor) return null;
    const pack = packFromText(line.description + " " + line.packSize);
    const row: ProductRow = {
        line: 0, name: productName(line), family: guessFamily(line.description), category: "",
        size: pack.size, unit: pack.unit, packaging: pack.packaging, vendor: vendor.companyName,
        buyAs: pack.unitsPer > 1 ? "case" : pack.packaging === "keg" ? "keg" : "single",
        unitsPer: pack.unitsPer, price: line.unitPrice, par: null, barcode: "", status: "new", problem: ""
    };
    importProductRows([row]);
    const product = db.products.find((p) => p.name.toLowerCase() === row.name.toLowerCase());
    const format = db.formats.find((f) => f.productId === product?.id && f.unitSize === row.size && f.sizeUnit === row.unit);
    const unit = db.purchaseUnits.find((u) => u.formatId === format?.id && u.vendorId === vendorId && u.unitAmount === row.unitsPer);
    if (unit && line.sku && !unit.sku) {
        unit.sku = line.sku;
        commit();
    }
    return unit?.id ?? null;
}


// ===== Create the invoice =====

// Make the draft invoice and remember every match for next time. Returns the invoice id.
//     IF the vendor is new -> add it first
//     FOR each line that isn't skipped and has a product -> an invoice line
//     Skipped lines are listed in the invoice's note, so nothing silently disappears
export function createInvoiceFromDraft(draft: Draft): string {
    const vendorId = draft.vendorId ?? createVendor(draft.vendorName || "New vendor");
    const invoiceId = makeId();
    const used = draft.lines.filter((l) => !l.skip && l.purchaseUnitId);
    const skipped = draft.lines.filter((l) => !used.includes(l));
    db.invoices.push({
        id: invoiceId, vendorId, orderId: null, number: draft.number, invoiceDate: draft.date || new Date().toISOString().slice(0, 10),
        status: "unreconciled",
        note: "Scanned from a photo." + (skipped.length > 0 ? " Not entered: " + skipped.map((l) => l.scanned.description).join("; ") + "." : "")
    });
    for (const line of used) {
        db.invoiceLines.push({ id: makeId(), invoiceId, purchaseUnitId: line.purchaseUnitId!, quantity: line.quantity, unitPrice: line.unitPrice });
        const key = lineKey(line.scanned);
        const link = db.invoiceItemLinks.find((l) => l.vendorId === vendorId && l.key === key);
        if (link) link.purchaseUnitId = line.purchaseUnitId!;
        else db.invoiceItemLinks.push({ id: makeId(), vendorId, key, purchaseUnitId: line.purchaseUnitId! });
    }
    commit();
    return invoiceId;
}

// "Island White Rum · 1000 ml bottle · case of 12", for the product picker
export function unitLabel(unit: PurchaseUnit): string {
    const format = findById(db.formats, unit.formatId);
    const product = findById(db.products, format?.productId ?? null);
    return (product?.name ?? "?") + " · " + (format ? format.unitSize + " " + format.sizeUnit + " " + format.packaging : "") + " · " + buyName(unit);
}
