// ===== variance.ts =====
// Sales imports, the waste log, and the report owners pay for: SOLD vs USED.
//
// Between two finished counts (opening and closing):
//     ACTUAL used       = opening + purchased - closing          (what disappeared)
//     THEORETICAL used  = what the drinks sold should have used   (from usage.ts)
//     WASTE             = what was logged as spilled, comped, broken
//     VARIANCE          = actual - theoretical - waste             (positive = missing)
//     POUR COST         = $ actually used ÷ $ sales
//
// Which records count for the period (opening date < date <= closing date):
//     invoices by invoice date, waste by its date, sales reports by their LAST day.

import { db, commit } from "./storage";
import { countTotals, unitCost } from "./inventory";
import { addRecipeUsage, batchesFor, emptyUsage, type UsageResult } from "./usage";
import { findById, makeId, now } from "./utils";
import type { PosLink, SalesLine, StockCount, WasteEntry } from "./types";


// ===== Sales imports =====

export interface ParsedSale {
    itemName: string;
    quantity: number;
    revenue: number;
}

// The recipe a POS item name goes to: a remembered link, ELSE a recipe with the same name, ELSE null
export function matchRecipe(itemName: string): { recipeId: string | null; ignored: boolean } {
    const key = itemName.trim().toLowerCase();
    const link = db.posLinks.find((l) => l.posName === key);
    if (link) return { recipeId: link.recipeId, ignored: link.ignored };
    const recipe = db.recipes.find((r) => r.name.trim().toLowerCase() === key);
    return { recipeId: recipe?.id ?? null, ignored: false };
}

// Save a sales report; returns its id
//     The same item on several rows (one per day, say) is added together.
export function importSales(name: string, startDate: string, endDate: string, rows: ParsedSale[]): string {
    const id = makeId();
    db.salesImports.push({ id, name, startDate, endDate, importedAt: now() });
    const byItem = new Map<string, SalesLine>();
    for (const row of rows) {
        const key = row.itemName.trim().toLowerCase();
        if (key === "") continue;
        const existing = byItem.get(key);
        if (existing) {
            existing.quantity += row.quantity;
            existing.revenue += row.revenue;
        } else {
            const match = matchRecipe(row.itemName);
            byItem.set(key, {
                id: makeId(), importId: id, itemName: row.itemName.trim(),
                quantity: row.quantity, revenue: row.revenue, recipeId: match.recipeId
            });
        }
    }
    db.salesLines.push(...byItem.values());
    commit();
    return id;
}

export function deleteSalesImport(importId: string) {
    db.salesImports = db.salesImports.filter((i) => i.id !== importId);
    db.salesLines = db.salesLines.filter((l) => l.importId !== importId);
    commit();
}

// Match a POS item to a recipe (or ignore it), and remember that for every import
//     recipeId "" = not matched yet, "ignore" = not something we track
export function linkPosItem(itemName: string, choice: string) {
    const key = itemName.trim().toLowerCase();
    const recipeId = choice === "" || choice === "ignore" ? null : choice;
    const ignored = choice === "ignore";
    const link: PosLink | undefined = db.posLinks.find((l) => l.posName === key);
    if (choice === "") db.posLinks = db.posLinks.filter((l) => l !== link);
    else if (link) Object.assign(link, { recipeId, ignored });
    else db.posLinks.push({ id: makeId(), posName: key, recipeId, ignored });
    for (const line of db.salesLines) {
        if (line.itemName.trim().toLowerCase() === key) line.recipeId = recipeId;
    }
    commit();
}

// Is this sales line ignored on purpose?
export function isIgnored(line: SalesLine): boolean {
    return db.posLinks.some((l) => l.posName === line.itemName.trim().toLowerCase() && l.ignored);
}


// ===== Waste log =====

export function addWaste(entry: Omit<WasteEntry, "id">) {
    db.wasteEntries.push({ id: makeId(), ...entry });
    commit();
}

export function deleteWaste(wasteId: string) {
    db.wasteEntries = db.wasteEntries.filter((w) => w.id !== wasteId);
    commit();
}

// What a waste entry used, in units per format
export function wasteUsage(entry: WasteEntry, into: UsageResult) {
    if (entry.kind === "product" && entry.formatId !== null) {
        into.units.set(entry.formatId, (into.units.get(entry.formatId) ?? 0) + entry.quantity);
    } else if (entry.kind === "recipe" && entry.recipeId !== null) {
        const recipe = findById(db.recipes, entry.recipeId);
        if (recipe) addRecipeUsage(recipe.id, batchesFor(recipe, entry.quantity), into);
    }
}

// $ value of a waste entry, or null if something has no price
export function wasteValue(entry: WasteEntry): number | null {
    const usage = emptyUsage();
    wasteUsage(entry, usage);
    let total = 0;
    for (const [formatId, units] of usage.units) {
        const cost = unitCost(formatId);
        if (cost === null) return null;
        total += units * cost;
    }
    return total;
}


// ===== The variance report =====

export interface VarianceRow {
    formatId: string;
    opening: number;
    purchased: number;
    closing: number;
    actual: number;        // opening + purchased - closing
    theoretical: number;   // from sales
    waste: number;
    variance: number;      // actual - theoretical - waste (positive = missing)
    unitCost: number | null;
}

export interface VarianceReport {
    opening: StockCount;
    closing: StockCount;
    rows: VarianceRow[];
    openingValue: number;
    closingValue: number;
    purchasesValue: number;
    usedValue: number;          // cost of goods actually used
    theoreticalValue: number;   // what the sales should have used
    wasteValue: number;
    varianceValue: number;      // $ missing (positive) or extra (negative)
    sales: number;              // $ revenue in the period
    pourCost: number | null;    // usedValue ÷ sales
    idealPourCost: number | null;   // theoreticalValue ÷ sales
    unmatchedSales: number;     // POS items sold but not matched to a recipe
    salesReports: number;
    problems: string[];         // ingredients that couldn't be traced to a product
}

// Is a date inside the period? (after the opening count, up to and including the closing count)
function inPeriod(date: string, opening: StockCount, closing: StockCount): boolean {
    const day = date.slice(0, 10);
    return day > opening.countedAt && day <= closing.countedAt;
}

// Build the report between two finished counts
export function varianceReport(openingId: string, closingId: string): VarianceReport | null {
    const opening = findById(db.stockCounts, openingId);
    const closing = findById(db.stockCounts, closingId);
    if (opening === null || closing === null || opening.countedAt >= closing.countedAt) return null;

    const open = countTotals(opening.id);
    const close = countTotals(closing.id);

    // Purchases: invoice lines dated in the period, converted to units
    const purchased = new Map<string, number>();
    let purchasesValue = 0;
    for (const line of db.invoiceLines) {
        const invoice = findById(db.invoices, line.invoiceId);
        const unit = findById(db.purchaseUnits, line.purchaseUnitId);
        if (invoice === null || unit === null || !inPeriod(invoice.invoiceDate, opening, closing)) continue;
        purchased.set(unit.formatId, (purchased.get(unit.formatId) ?? 0) + line.quantity * unit.unitAmount);
        purchasesValue += line.quantity * line.unitPrice;
    }

    // Theoretical usage from sales reports that end in the period
    const theoretical = emptyUsage();
    let sales = 0;
    let unmatchedSales = 0;
    let salesReports = 0;
    for (const report of db.salesImports) {
        if (!inPeriod(report.endDate, opening, closing)) continue;
        salesReports++;
        for (const line of db.salesLines.filter((l) => l.importId === report.id)) {
            if (isIgnored(line)) continue;
            sales += line.revenue;
            const recipe = findById(db.recipes, line.recipeId);
            if (recipe === null) {
                unmatchedSales++;
                continue;
            }
            addRecipeUsage(recipe.id, batchesFor(recipe, line.quantity), theoretical);
        }
    }

    // Waste logged in the period
    const waste = emptyUsage();
    for (const entry of db.wasteEntries) {
        if (inPeriod(entry.date, opening, closing)) wasteUsage(entry, waste);
    }

    // One row per format that shows up anywhere
    const formatIds = new Set([...open.units.keys(), ...close.units.keys(), ...purchased.keys(), ...theoretical.units.keys(), ...waste.units.keys()]);
    const rows: VarianceRow[] = [];
    for (const formatId of formatIds) {
        if (findById(db.formats, formatId) === null) continue;
        const o = open.units.get(formatId) ?? 0;
        const p = purchased.get(formatId) ?? 0;
        const c = close.units.get(formatId) ?? 0;
        const t = theoretical.units.get(formatId) ?? 0;
        const w = waste.units.get(formatId) ?? 0;
        const actual = o + p - c;
        rows.push({ formatId, opening: o, purchased: p, closing: c, actual, theoretical: t, waste: w, variance: actual - t - w, unitCost: unitCost(formatId) });
    }

    // Biggest $ loss first
    const money = (r: VarianceRow) => (r.unitCost ?? 0) * r.variance;
    rows.sort((a, b) => money(b) - money(a));

    const sum = (pick: (r: VarianceRow) => number) => rows.reduce((total, r) => total + (r.unitCost ?? 0) * pick(r), 0);
    const usedValue = sum((r) => r.actual);
    const theoreticalValue = sum((r) => r.theoretical);
    const wasteValue = sum((r) => r.waste);

    return {
        opening, closing, rows,
        openingValue: open.value,
        closingValue: close.value,
        purchasesValue,
        usedValue,
        theoreticalValue,
        wasteValue,
        varianceValue: usedValue - theoreticalValue - wasteValue,
        sales,
        pourCost: sales > 0 ? usedValue / sales : null,
        idealPourCost: sales > 0 ? theoreticalValue / sales : null,
        unmatchedSales,
        salesReports,
        problems: [...theoretical.problems, ...waste.problems]
    };
}

// Finished counts, oldest first (the report picks two of these)
export function closedCounts(): StockCount[] {
    return db.stockCounts.filter((c) => c.status === "closed").sort((a, b) => a.countedAt.localeCompare(b.countedAt));
}
