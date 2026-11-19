// ===== inventory.ts =====
// Storage areas, stock counts, and what's on hand.
//
// Stock is counted per FORMAT (a 1 L bottle), the way you'd count a shelf:
//     unopened cases + loose units      e.g. 2 cases + 4.3 bottles
//     total units = cases × case size + loose units
//     value       = total units × cost of one unit

import { db, commit } from "./storage";
import { currentPrice } from "./prices";
import { findById, makeId, today } from "./utils";
import type { CountLine, Format, StockCount } from "./types";


// ===== Areas =====

export function createArea(name: string) {
    db.areas.push({ id: makeId(), name: name.trim() || "New area" });
    commit();
}

export function renameArea(areaId: string, name: string) {
    const area = findById(db.areas, areaId);
    if (area === null || name.trim() === "") return;
    area.name = name.trim();
    commit();
}

// Delete an area; anything counted there moves to "No area" so totals don't change
export function deleteArea(areaId: string) {
    db.areas = db.areas.filter((a) => a.id !== areaId);
    for (const line of db.countLines) {
        if (line.areaId === areaId) line.areaId = null;
    }
    commit();
}


// ===== Unit sizes and costs =====

// How many units are in a case of this format: the biggest pack any vendor sells (1 if none)
export function caseSize(formatId: string): number {
    let size = 1;
    for (const unit of db.purchaseUnits) {
        if (unit.formatId === formatId && unit.unitAmount > size) size = unit.unitAmount;
    }
    return size;
}

// What one unit of a format (one bottle, one bag) costs, or null if there's no price
//     IF the ingredient's house choice is one of this format's purchase units, use its price
//     ELSE use the cheapest per-unit price among this format's purchase units
export function unitCost(formatId: string): number | null {
    const format = findById(db.formats, formatId);
    if (format === null) return null;
    const product = findById(db.products, format.productId);
    const ingredient = findById(db.ingredients, product?.ingredientId ?? null);
    let best: number | null = null;
    for (const unit of db.purchaseUnits) {
        if (unit.formatId !== formatId || unit.unitAmount <= 0) continue;
        const price = currentPrice(unit.id);
        if (price <= 0) continue;
        const perUnit = price / unit.unitAmount;
        if (ingredient !== null && ingredient.housePurchaseUnitId === unit.id) return perUnit;
        if (best === null || perUnit < best) best = perUnit;
    }
    return best;
}

// "Island White Rum · 1000 ml bottle"
export function formatLabel(format: Format): string {
    const product = findById(db.products, format.productId);
    return (product?.name ?? "?") + " · " + format.unitSize + " " + format.sizeUnit + (format.packaging ? " " + format.packaging : "");
}

// The word for one unit: "bottle", "bag", or "unit" if it has no packaging name
export function unitWord(format: Format): string {
    return format.packaging || "unit";
}


// ===== Counts =====

// Start a new count, open for editing, and return its id
export function createCount(name = ""): string {
    const count: StockCount = { id: makeId(), name: name.trim() || "Count", countedAt: today(), status: "open" };
    db.stockCounts.push(count);
    commit();
    return count.id;
}

export function updateCount(countId: string, changes: Partial<StockCount>) {
    const count = findById(db.stockCounts, countId);
    if (count === null) return;
    Object.assign(count, changes);
    commit();
}

export function deleteCount(countId: string) {
    db.stockCounts = db.stockCounts.filter((c) => c.id !== countId);
    db.countLines = db.countLines.filter((l) => l.countId !== countId);
    commit();
}

// The line for one format in one area of a count, or null
export function findCountLine(countId: string, areaId: string | null, formatId: string): CountLine | null {
    return db.countLines.find((l) => l.countId === countId && l.areaId === areaId && l.formatId === formatId) ?? null;
}

// Save what was counted
//     IF both are zero, remove the line (nothing there)
//     ELSE update the line, or add one
export function setCount(countId: string, areaId: string | null, formatId: string, cases: number, units: number) {
    const line = findCountLine(countId, areaId, formatId);
    if (cases === 0 && units === 0) {
        if (line !== null) db.countLines = db.countLines.filter((l) => l !== line);
    } else if (line !== null) {
        line.cases = cases;
        line.units = units;
    } else {
        db.countLines.push({ id: makeId(), countId, areaId, formatId, cases, units });
    }
    commit();
}

// Total units of a line: cases × case size + loose units
export function lineUnits(line: CountLine): number {
    return line.cases * caseSize(line.formatId) + line.units;
}

export interface CountTotals {
    units: Map<string, number>;   // formatId -> total units across every area
    value: number;                // total $ of everything that has a price
    unpriced: number;             // how many formats were counted with no price
}

// Add up a count across all areas
export function countTotals(countId: string): CountTotals {
    const units = new Map<string, number>();
    for (const line of db.countLines) {
        if (line.countId !== countId) continue;
        units.set(line.formatId, (units.get(line.formatId) ?? 0) + lineUnits(line));
    }
    let value = 0;
    let unpriced = 0;
    for (const [formatId, total] of units) {
        const cost = unitCost(formatId);
        if (cost === null) unpriced++;
        else value += total * cost;
    }
    return { units, value, unpriced };
}

// The most recent closed count, or null if none has been closed yet
export function latestClosedCount(): StockCount | null {
    let latest: StockCount | null = null;
    for (const count of db.stockCounts) {
        if (count.status !== "closed") continue;
        if (latest === null || count.countedAt > latest.countedAt) latest = count;
    }
    return latest;
}

// How many units of a format are on hand, from the latest closed count
//     null = no closed count yet, so we don't know
export function onHand(formatId: string): number | null {
    const latest = latestClosedCount();
    if (latest === null) return null;
    return countTotals(latest.id).units.get(formatId) ?? 0;
}
