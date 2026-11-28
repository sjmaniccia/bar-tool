// ===== wasteScan.ts =====
// A scanned waste log -> lines to check -> waste entries (the same as logging by hand).
//
//     MATCH    each written item to a drink/dish or a product, by its words:
//                  "marg" -> Margarita (a word can be the start of a name)
//                  "Tito's" -> Tito's Handmade Vodka · 1 L bottle
//              the unit hints which: "drink", "shot", "comp" -> a recipe; "bottle", "oz" -> a product
//     AMOUNT   for a product, ounces or ml become part of a bottle (2 oz of a 1 L bottle = 0.059)
//     CHECK    unmatched lines start unticked; nothing is saved until "Log them"

import type { ScannedWaste } from "../cloud/scan";
import { db } from "./storage";
import { findById, makeId } from "./utils";
import { convert, familyOf } from "./units";
import { addWaste } from "./variance";
import { formatLabel } from "./inventory";
import type { WasteReason } from "./types";

export interface WasteDraft {
    key: string;
    include: boolean;
    written: ScannedWaste;
    date: string;
    kind: "recipe" | "product";
    itemId: string;             // "" = not matched yet
    quantity: number;
    reason: WasteReason;
    note: string;
}

const RECIPE_UNITS = ["drink", "shot", "pour", "glass", "plate", "order", "serving", "cocktail", "round", "pint", "beer"];
const PRODUCT_UNITS = ["bottle", "case", "can", "keg", "bag", "box", "each", "oz", "ml", "l", "liter", "quart", "gallon", "lb", "jar"];
const FILLER = new Set(["the", "a", "of", "and", "bottle", "btl", "ml", "l", "oz", "1l", "750", "750ml"]);

function words(text: string): string[] {
    return text.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w));
}

// How well "marg" fits "Margarita": shared words, where a written word can be a name word's start
function fit(written: string[], name: string): number {
    const target = words(name);
    if (written.length === 0 || target.length === 0) return 0;
    let hits = 0;
    for (const w of written) {
        if (target.some((t) => t === w || (w.length >= 3 && t.startsWith(w)))) hits++;
    }
    return hits / Math.max(written.length, 1) - 0.01 * Math.max(0, target.length - written.length);
}

// The best drink/dish and the best product for a written item
export function matchWaste(line: ScannedWaste): { kind: "recipe" | "product"; itemId: string } {
    const w = words(line.item);
    let recipe = { id: "", score: 0 };
    for (const r of db.recipes) {
        if (r.type === "Prep") continue;
        const s = fit(w, r.name);
        if (s > recipe.score) recipe = { id: r.id, score: s };
    }
    let product = { id: "", score: 0 };
    for (const f of db.formats) {
        const name = findById(db.products, f.productId)?.name ?? "";
        const s = fit(w, name);
        if (s > product.score) product = { id: f.id, score: s };
    }
    const leanRecipe = RECIPE_UNITS.includes(line.unit) || line.reason === "comp" || line.reason === "returned";
    const leanProduct = PRODUCT_UNITS.includes(line.unit) || line.reason === "breakage" || line.reason === "expired";
    const bonus = (on: boolean) => (on ? 0.25 : 0);
    const r = recipe.score + bonus(leanRecipe);
    const p = product.score + bonus(leanProduct);
    if (recipe.score < 0.5 && product.score < 0.5) return { kind: leanProduct ? "product" : "recipe", itemId: "" };
    return r >= p ? { kind: "recipe", itemId: recipe.id } : { kind: "product", itemId: product.id };
}

// How many of the product's units: "2 oz" of a 1 L bottle -> 0.059; "1 bottle" -> 1
export function productQuantity(line: ScannedWaste, formatId: string): number {
    const format = findById(db.formats, formatId);
    const unit = line.unit === "oz" ? "fl oz" : line.unit === "l" ? "L" : line.unit;
    if (format && familyOf(unit) && familyOf(unit) === familyOf(format.sizeUnit)) {
        const inUnits = convert(line.quantity, unit, format.sizeUnit);
        if (inUnits !== null && format.unitSize > 0) return Math.round((inUnits / format.unitSize) * 1000) / 1000;
    }
    return line.quantity;
}

export function buildWasteDrafts(lines: ScannedWaste[], fallbackDate: string): WasteDraft[] {
    return lines.map((line) => {
        const match = matchWaste(line);
        return {
            key: makeId(),
            include: match.itemId !== "",
            written: line,
            date: line.date || fallbackDate,
            kind: match.kind,
            itemId: match.itemId,
            quantity: match.kind === "product" && match.itemId ? productQuantity(line, match.itemId) : line.quantity,
            reason: line.reason,
            note: line.note
        };
    });
}

// Log the ticked, matched lines -> how many were logged
export function saveWasteDrafts(drafts: WasteDraft[]): number {
    let saved = 0;
    for (const d of drafts) {
        if (!d.include || d.itemId === "" || !(d.quantity > 0)) continue;
        addWaste({
            date: d.date, kind: d.kind,
            formatId: d.kind === "product" ? d.itemId : null,
            recipeId: d.kind === "recipe" ? d.itemId : null,
            quantity: d.quantity, reason: d.reason,
            note: [d.note, "scanned: " + d.written.item].filter(Boolean).join(" · ")
        });
        saved++;
    }
    return saved;
}

export function itemLabel(kind: "recipe" | "product", id: string): string {
    return kind === "recipe" ? findById(db.recipes, id)?.name ?? "" : (() => { const f = findById(db.formats, id); return f ? formatLabel(f) : ""; })();
}
