// ===== backup.ts =====
// Getting data in and out of Agave:
//     BACKUP      the whole database as one .json file, and restoring it
//     EXPORTS     CSV files a spreadsheet or accountant can open
//     IMPORT      a products spreadsheet -> products, formats, purchase units and prices
//
// Why: the data lives in this browser only (until Step 6 adds a server),
// so a backup file is the safety net, and CSVs are the way out to Excel / QuickBooks.

import { db, commit, loadData, replaceAll } from "./storage";
import { findById, makeId, now, today } from "./utils";
import { addPrice, currentPrice } from "./prices";
import { summarize } from "./costing";
import { buyName, FAMILIES, isSupplyFamily } from "./library";
import { countTotals, formatLabel, unitCost } from "./inventory";
import { getOrCreateIngredient } from "./actions";
import { parseMoney, findColumn, toCsv } from "./csv";
import { familyOf, YIELD_UNITS } from "./units";
import type { Database, Format, Product, PurchaseUnit } from "./types";


// ===== Backup and restore =====

const BACKUP_APP = "agave";

// Everything, as pretty JSON with a small header saying what it is
export function backupJson(): string {
    return JSON.stringify({ app: BACKUP_APP, savedAt: now(), data: db }, null, 2);
}

export function backupFileName(): string {
    return "agave-backup-" + today() + ".json";
}

// What's in a backup file, so the person can check before replacing everything
export interface BackupPreview {
    data: Database;
    savedAt: string | null;
    counts: { label: string; count: number }[];
}

// Read a backup file
//     IF it isn't JSON, or has no tables we know, return an error message
//     ELSE run it through the same upgrades as a normal load (old backups still work)
export function readBackup(text: string): BackupPreview | string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return "That file isn't a Agave backup (it isn't JSON).";
    }
    // A backup has { app, savedAt, data }; a raw save is just the tables
    const wrapped = typeof parsed === "object" && parsed !== null && "data" in parsed;
    const tables = wrapped ? (parsed as { data: unknown }).data : parsed;
    if (typeof tables !== "object" || tables === null || !Array.isArray((tables as Record<string, unknown>).recipes)) {
        return "That file doesn't look like a Agave backup (no recipes table).";
    }
    const data = loadData(JSON.stringify(tables));
    const savedAt = wrapped ? String((parsed as { savedAt?: string }).savedAt ?? "") || null : null;
    return {
        data,
        savedAt,
        counts: [
            { label: "recipes", count: data.recipes.length },
            { label: "products", count: data.products.length },
            { label: "vendors", count: data.vendors.length },
            { label: "stock counts", count: data.stockCounts.length },
            { label: "invoices", count: data.invoices.length },
            { label: "sales reports", count: data.salesImports.length }
        ]
    };
}

export function restoreBackup(preview: BackupPreview) {
    replaceAll(preview.data);
}


// ===== CSV exports =====

// One count, valued: what an accountant needs at month end
export function countCsv(countId: string): string {
    const totals = countTotals(countId);
    const rows: (string | number | null)[][] = [["Product", "Format", "Family", "Units on hand", "Cost per unit", "Value"]];
    for (const [formatId, units] of totals.units) {
        const format = findById(db.formats, formatId);
        const product = findById(db.products, format?.productId ?? null);
        if (format === null || product === null) continue;
        const cost = unitCost(formatId);
        rows.push([
            product.name, formatLabel(format), product.family, round(units),
            cost === null ? null : round(cost), cost === null ? null : round(units * cost)
        ]);
    }
    rows.push(["Total", "", "", "", "", round(totals.value)]);
    return toCsv(rows);
}

// Every recipe with its cost and margin
export function recipesCsv(): string {
    const rows: (string | number | null)[][] = [["Recipe", "Type", "Cost per serving", "Menu price", "Cost %", "Target %", "Profit", "Missing prices"]];
    for (const recipe of [...db.recipes].sort((a, b) => a.name.localeCompare(b.name))) {
        const s = summarize(recipe);
        rows.push([
            recipe.name, recipe.type, round(s.totalCost), recipe.menuPrice,
            s.totalRatio === null ? null : round(s.totalRatio * 100),
            round(s.targetCost * 100),
            s.profit === null ? null : round(s.profit),
            s.missing.join("; ")
        ]);
    }
    return toCsv(rows);
}

// The product library as a price list. Same columns as the import template,
// so a bar can export, fix prices in a spreadsheet, and import again.
export function productsCsv(): string {
    const rows: (string | number | null)[][] = [TEMPLATE_HEADERS];
    for (const unit of db.purchaseUnits) {
        const format = findById(db.formats, unit.formatId);
        const product = findById(db.products, format?.productId ?? null);
        if (format === null || product === null) continue;
        const vendor = findById(db.vendors, unit.vendorId);
        const price = currentPrice(unit.id);
        rows.push([
            product.name, product.family, product.category, format.unitSize, format.sizeUnit,
            format.packaging, vendor?.companyName ?? "", unit.name, unit.unitAmount,
            price > 0 ? price : null, format.par, format.barcode
        ]);
    }
    return toCsv(rows);
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}


// ===== Products spreadsheet import =====

export const TEMPLATE_HEADERS = ["Name", "Family", "Category", "Size", "Unit", "Packaging", "Vendor", "Buy as", "Units per", "Price", "Par", "Barcode"];

// A filled-in example row so the template explains itself
export function templateCsv(): string {
    return toCsv([
        TEMPLATE_HEADERS,
        ["Island White Rum", "Spirits", "Rum", 1000, "ml", "bottle", "Southern Glazer's", "case", 12, 210, 6, ""],
        ["Island White Rum", "Spirits", "Rum", 1000, "ml", "bottle", "Southern Glazer's", "single", 1, 19, 6, ""],
        ["Limes", "Produce", "Citrus", 1, "each", "each", "Produce Co", "case", 200, 40, "", ""]
    ]);
}

// One spreadsheet row, read and checked
export interface ProductRow {
    line: number;            // row number in the file, for error messages
    name: string;
    family: string;
    category: string;
    size: number;
    unit: string;
    packaging: string;
    vendor: string;
    buyAs: string;
    unitsPer: number;
    price: number | null;
    par: number | null;
    barcode: string;
    status: "new" | "update" | "error";
    problem: string;         // why it's an error
}

// Read the rows of a products sheet
//     FOR each row:
//         find each column by its header (so the order doesn't matter)
//         IF there's no name or size, mark it an error
//         IF a product with that name and size already exists, it's an update
export function readProductRows(rows: string[][]): ProductRow[] | string {
    if (rows.length < 2) return "The file has no rows under the headers.";
    const headers = rows[0];
    const col = {
        name: findColumn(headers, ["name", "product", "item"]),
        family: findColumn(headers, ["family"]),
        category: findColumn(headers, ["category", "type"]),
        size: findColumn(headers, ["size", "volume"]),
        unit: findColumn(headers, ["unit", "uom"]),
        packaging: findColumn(headers, ["packaging", "container"]),
        vendor: findColumn(headers, ["vendor", "distributor", "supplier"]),
        buyAs: findColumn(headers, ["buy as", "pack"]),
        unitsPer: findColumn(headers, ["units per", "case size", "per case"]),
        price: findColumn(headers, ["price", "cost"]),
        par: findColumn(headers, ["par"]),
        barcode: findColumn(headers, ["barcode", "upc"])
    };
    if (col.name === -1) return "Couldn't find a Name column. Download the template to see the headers.";
    // "unit" also matches "units per", so if they collide, look for an exact "unit"
    if (col.unit === col.unitsPer) col.unit = headers.findIndex((h) => h.trim().toLowerCase() === "unit");

    const cell = (row: string[], index: number) => (index === -1 ? "" : (row[index] ?? "").trim());
    const number = (text: string) => (text === "" ? null : parseMoney(text));

    return rows.slice(1).map((row, i) => {
        const size = number(cell(row, col.size));
        const unit = matchUnit(cell(row, col.unit) || "ml");
        const unitsPer = number(cell(row, col.unitsPer));
        const price = number(cell(row, col.price));
        const par = number(cell(row, col.par));
        const parsed: ProductRow = {
            line: i + 2,
            name: cell(row, col.name),
            family: matchFamily(cell(row, col.family)),
            category: cell(row, col.category),
            size: size ?? NaN,
            unit,
            packaging: cell(row, col.packaging) || "bottle",
            vendor: cell(row, col.vendor),
            buyAs: cell(row, col.buyAs) || "single",
            unitsPer: unitsPer === null || isNaN(unitsPer) ? 1 : unitsPer,
            price: price === null || isNaN(price) ? null : price,
            par: par === null || isNaN(par) ? null : par,
            barcode: cell(row, col.barcode),
            status: "new",
            problem: ""
        };
        if (parsed.name === "") parsed.problem = "No name";
        else if (isNaN(parsed.size) || parsed.size <= 0) parsed.problem = "Size must be a number";
        else if (familyOf(parsed.unit) === null) parsed.problem = 'Unknown unit "' + parsed.unit + '"';
        if (parsed.problem !== "") parsed.status = "error";
        else if (findFormat(parsed) !== null) parsed.status = "update";
        return parsed;
    });
}

// "ML" -> "ml", "l" -> "L": the app's spelling of a unit, or the text as typed if unknown
function matchUnit(text: string): string {
    const lower = text.toLowerCase();
    return YIELD_UNITS.find((u) => u.toLowerCase() === lower) ?? text;
}

// "spirit" -> "Spirits"; unknown families go to Other
function matchFamily(text: string): string {
    if (text === "") return "Spirits";
    const lower = text.toLowerCase();
    return FAMILIES.find((f) => f.toLowerCase().startsWith(lower.slice(0, 4))) ?? "Other";
}

// The product with this name (any case) and the format with this size, if they exist
function findProduct(name: string): Product | null {
    const lower = name.toLowerCase();
    return db.products.find((p) => p.name.toLowerCase() === lower) ?? null;
}

function findFormat(row: ProductRow): Format | null {
    const product = findProduct(row.name);
    if (product === null) return null;
    return db.formats.find((f) => f.productId === product.id && f.unitSize === row.size && f.sizeUnit === row.unit) ?? null;
}

export interface ImportResult {
    products: number;       // new products made
    formats: number;        // new formats made
    units: number;          // new purchase units made
    prices: number;         // prices recorded
    vendors: number;        // new vendors made
}

// Add every good row
//     FOR each row that isn't an error:
//         find or make the vendor, the product (with a matching ingredient), the format,
//         and the purchase unit (vendor + buy-as + units per)
//         IF there's a price and it changed, record it
//         IF there's a par or barcode, set it on the format
export function importProductRows(rows: ProductRow[]): ImportResult {
    const result: ImportResult = { products: 0, formats: 0, units: 0, prices: 0, vendors: 0 };
    for (const row of rows) {
        if (row.status === "error") continue;

        let vendorId: string | null = null;
        if (row.vendor !== "") {
            const lower = row.vendor.toLowerCase();
            let vendor = db.vendors.find((v) => v.companyName.toLowerCase() === lower) ?? null;
            if (vendor === null) {
                vendor = {
                    id: makeId(), companyName: row.vendor, companyPhone: "", street: "", city: "", state: "",
                    zip: "", repName: "", repPhone: "", repEmail: "", orderDays: "", notes: ""
                };
                db.vendors.push(vendor);
                result.vendors++;
            }
            vendorId = vendor.id;
        }

        let product = findProduct(row.name);
        if (product === null) {
            product = {
                // Supplies (paper, cleaning...) never go into recipes, so they get no ingredient
                id: makeId(), ingredientId: isSupplyFamily(row.family) ? null : getOrCreateIngredient(row.name).id, name: row.name,
                family: row.family, category: row.category, subcategory: "", producer: "", abv: null, notes: ""
            };
            db.products.push(product);
            result.products++;
        }

        let format = findFormat(row);
        if (format === null) {
            format = {
                id: makeId(), productId: product.id, unitSize: row.size, sizeUnit: row.unit,
                packaging: row.packaging, yieldPercent: 100, par: null, barcode: ""
            };
            db.formats.push(format);
            result.formats++;
        }
        if (row.par !== null) format.par = row.par;
        if (row.barcode !== "") format.barcode = row.barcode;

        const formatId = format.id;
        let unit: PurchaseUnit | null = db.purchaseUnits.find((u) =>
            u.formatId === formatId && u.vendorId === vendorId && u.unitAmount === row.unitsPer) ?? null;
        if (unit === null) {
            unit = { id: makeId(), formatId, vendorId, name: row.buyAs, unitAmount: row.unitsPer, sku: "" };
            db.purchaseUnits.push(unit);
            result.units++;
        }

        if (row.price !== null && row.price > 0 && Math.abs(currentPrice(unit.id) - row.price) > 0.001) {
            addPrice(unit.id, row.price, now());
            result.prices++;
        }
    }
    commit();
    return result;
}

// "case of 12 from Southern Glazer's", for the preview table
export function rowBuyText(row: ProductRow): string {
    const name = buyName({ id: "", formatId: "", vendorId: null, name: row.buyAs, unitAmount: row.unitsPer, sku: "" });
    return row.vendor === "" ? name : name + " from " + row.vendor;
}
