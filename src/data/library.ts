// ===== library.ts =====
// Changes for the product library, ingredients and vendors.
// Same rule as actions.ts: change db, then commit() saves and redraws.
//
// The chain, top to bottom:
//     PRODUCT        what it is            "Island White Rum"
//     FORMAT         how it's packed       1 L bottle         (counted in stock)
//     PURCHASE UNIT  how you buy it        case of 12 from Southern Glazer's (ordered, priced)
//     PRICE ENTRY    what it cost, when    $210 on Nov 1

import { db, commit } from "./storage";
import { findById, makeId, now } from "./utils";
import { addPrice } from "./prices";
import { houseSource, sourceCostPerUnit, sourceUnit, sourcesFor, type Source } from "./costing";
import { displayUnitFor } from "./units";
import type { Format, Ingredient, PriceEntry, Product, PurchaseUnit, Vendor } from "./types";

// Product families, the top level of the library (then category, then subcategory)
export const FAMILIES = [
    "Spirits", "Wine", "Beer", "Non-alcoholic", "Produce", "Meat & seafood",
    "Dairy", "Dry goods", "Brewing", "Paper products", "Other"
];


// ===== Products =====

// Create a product with one 750 ml bottle format, and return its id
export function createProduct(name: string, family = "Spirits"): string {
    const product: Product = {
        id: makeId(), ingredientId: null, name: name.trim() || "New product",
        family, category: "", subcategory: "", producer: "", abv: null
    };
    db.products.push(product);
    db.formats.push(newFormat(product.id));
    commit();
    return product.id;
}

export function updateProduct(productId: string, changes: Partial<Product>) {
    const product = findById(db.products, productId);
    if (product === null) return;
    Object.assign(product, changes);
    commit();
}

// Can this product be deleted? Not if it's on an order or invoice (that history must stay)
export function productInUse(productId: string): boolean {
    const formatIds = new Set(db.formats.filter((f) => f.productId === productId).map((f) => f.id));
    const unitIds = new Set(db.purchaseUnits.filter((u) => formatIds.has(u.formatId)).map((u) => u.id));
    return db.orderLines.some((l) => unitIds.has(l.purchaseUnitId))
        || db.invoiceLines.some((l) => unitIds.has(l.purchaseUnitId));
}

// Delete a product and everything under it
//     Returns false (and deletes nothing) if it's on an order or invoice
export function deleteProduct(productId: string): boolean {
    if (productInUse(productId)) return false;
    for (const format of db.formats.filter((f) => f.productId === productId)) {
        removeFormatRows(format.id);
    }
    db.products = db.products.filter((p) => p.id !== productId);
    commit();
    return true;
}


// ===== Formats =====

function newFormat(productId: string): Format {
    return { id: makeId(), productId, unitSize: 750, sizeUnit: "ml", packaging: "bottle", yieldPercent: 100, par: null };
}

export function addFormat(productId: string) {
    db.formats.push(newFormat(productId));
    commit();
}

export function updateFormat(formatId: string, changes: Partial<Format>) {
    const format = findById(db.formats, formatId);
    if (format === null) return;
    Object.assign(format, changes);
    commit();
}

// Remove a format, its purchase units, their prices, and anything pointing at them (no commit)
function removeFormatRows(formatId: string) {
    for (const unit of db.purchaseUnits.filter((u) => u.formatId === formatId)) {
        removeUnitRows(unit.id);
    }
    db.formats = db.formats.filter((f) => f.id !== formatId);
    db.countLines = db.countLines.filter((l) => l.formatId !== formatId);
}

export function formatInUse(formatId: string): boolean {
    const unitIds = new Set(db.purchaseUnits.filter((u) => u.formatId === formatId).map((u) => u.id));
    return db.orderLines.some((l) => unitIds.has(l.purchaseUnitId)) || db.invoiceLines.some((l) => unitIds.has(l.purchaseUnitId));
}

export function deleteFormat(formatId: string): boolean {
    if (formatInUse(formatId)) return false;
    removeFormatRows(formatId);
    commit();
    return true;
}


// ===== Purchase units =====

// Add a way to buy a format: a single by default, from the first vendor if there is one
export function addPurchaseUnit(formatId: string, vendorId: string | null = db.vendors[0]?.id ?? null) {
    const unit: PurchaseUnit = { id: makeId(), formatId, vendorId, name: "single", unitAmount: 1, sku: "" };
    db.purchaseUnits.push(unit);
    commit();
}

export function updatePurchaseUnit(unitId: string, changes: Partial<PurchaseUnit>) {
    const unit = findById(db.purchaseUnits, unitId);
    if (unit === null) return;
    Object.assign(unit, changes);
    commit();
}

export function purchaseUnitInUse(unitId: string): boolean {
    return db.orderLines.some((l) => l.purchaseUnitId === unitId) || db.invoiceLines.some((l) => l.purchaseUnitId === unitId);
}

// Remove a purchase unit, its prices, and every choice pointing at it (no commit)
function removeUnitRows(unitId: string) {
    db.purchaseUnits = db.purchaseUnits.filter((u) => u.id !== unitId);
    db.priceEntries = db.priceEntries.filter((p) => p.purchaseUnitId !== unitId);
    for (const ingredient of db.ingredients) {
        if (ingredient.housePurchaseUnitId === unitId) ingredient.housePurchaseUnitId = null;
    }
    for (const line of db.recipeLines) {
        if (line.choicePurchaseUnitId === unitId) line.choicePurchaseUnitId = null;
    }
}

export function deletePurchaseUnit(unitId: string): boolean {
    if (purchaseUnitInUse(unitId)) return false;
    removeUnitRows(unitId);
    commit();
    return true;
}

// "case of 12" or "single"
export function buyName(unit: PurchaseUnit): string {
    return unit.unitAmount === 1 ? unit.name : unit.name + " of " + unit.unitAmount;
}


// ===== Prices =====

// Record a new price now (history is kept; the newest one counts)
export function recordPrice(unitId: string, amount: number) {
    addPrice(unitId, amount, now());
    commit();
}

// Every price for one purchase unit, newest first
export function priceHistory(unitId: string): PriceEntry[] {
    return db.priceEntries
        .filter((p) => p.purchaseUnitId === unitId)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export function deletePrice(priceId: string) {
    db.priceEntries = db.priceEntries.filter((p) => p.id !== priceId);
    commit();
}


// ===== Vendors =====

export function createVendor(name: string): string {
    const vendor: Vendor = {
        id: makeId(), companyName: name.trim() || "New vendor", companyPhone: "",
        street: "", city: "", state: "", zip: "", repName: "", repPhone: "",
        repEmail: "", orderDays: "", notes: ""
    };
    db.vendors.push(vendor);
    commit();
    return vendor.id;
}

export function updateVendor(vendorId: string, changes: Partial<Vendor>) {
    const vendor = findById(db.vendors, vendorId);
    if (vendor === null) return;
    Object.assign(vendor, changes);
    commit();
}

export function vendorInUse(vendorId: string): boolean {
    return db.orders.some((o) => o.vendorId === vendorId) || db.invoices.some((i) => i.vendorId === vendorId);
}

// Delete a vendor; products they sold stay, with no vendor
//     Returns false if they have orders or invoices
export function deleteVendor(vendorId: string): boolean {
    if (vendorInUse(vendorId)) return false;
    db.vendors = db.vendors.filter((v) => v.id !== vendorId);
    for (const unit of db.purchaseUnits) {
        if (unit.vendorId === vendorId) unit.vendorId = null;
    }
    commit();
    return true;
}

// Every purchase unit a vendor sells
export function unitsFromVendor(vendorId: string): PurchaseUnit[] {
    return db.purchaseUnits.filter((u) => u.vendorId === vendorId);
}


// ===== Ingredients =====

export function createIngredient(name: string): string {
    const ingredient: Ingredient = { id: makeId(), name: name.trim() || "New ingredient", housePurchaseUnitId: null, houseRecipeId: null };
    db.ingredients.push(ingredient);
    commit();
    return ingredient.id;
}

export function updateIngredient(ingredientId: string, changes: Partial<Ingredient>) {
    const ingredient = findById(db.ingredients, ingredientId);
    if (ingredient === null) return;
    Object.assign(ingredient, changes);
    commit();
}

// Set the house source: "unit:<id>", "recipe:<id>", or "" for none (cheapest is used)
export function setHouseSource(ingredientId: string, key: string) {
    const [kind, id] = key.split(":");
    updateIngredient(ingredientId, {
        housePurchaseUnitId: kind === "unit" ? id : null,
        houseRecipeId: kind === "recipe" ? id : null
    });
}

// Recipes whose lines use this ingredient
export function recipesUsingIngredient(ingredientId: string) {
    const recipeIds = new Set(db.recipeLines.filter((l) => l.ingredientId === ingredientId).map((l) => l.recipeId));
    return db.recipes.filter((r) => recipeIds.has(r.id));
}

// Delete an ingredient
//     Returns false if a recipe uses it or makes it (change those first)
export function deleteIngredient(ingredientId: string): boolean {
    if (recipesUsingIngredient(ingredientId).length > 0) return false;
    if (db.recipes.some((r) => r.producesIngredientId === ingredientId)) return false;
    db.ingredients = db.ingredients.filter((i) => i.id !== ingredientId);
    db.ingredientConversions = db.ingredientConversions.filter((c) => c.ingredientId !== ingredientId);
    for (const product of db.products) {
        if (product.ingredientId === ingredientId) product.ingredientId = null;
    }
    commit();
    return true;
}

// Add "1 each = 0.25 lb" for one ingredient
export function addConversion(ingredientId: string, fromAmount: number, fromUnit: string, toAmount: number, toUnit: string) {
    db.ingredientConversions.push({ id: makeId(), ingredientId, fromAmount, fromUnit, toAmount, toUnit });
    commit();
}

export function removeConversion(conversionId: string) {
    db.ingredientConversions = db.ingredientConversions.filter((c) => c.id !== conversionId);
    commit();
}


// ===== What an ingredient costs right now =====

export interface IngredientCost {
    source: Source;
    cost: number;          // per `unit`
    unit: string;          // "fl oz", "lb", "each"
    isHouse: boolean;      // true = the house choice, false = cheapest (an estimate)
}

// The ingredient's house source cost, ELSE its cheapest source, or null if nothing can be priced
//     Costs are shown per display unit ("fl oz" for anything liquid)
export function ingredientCost(ingredient: Ingredient): IngredientCost | null {
    const house = houseSource(ingredient);
    if (house !== null) {
        const unit = displayUnitFor(sourceUnit(house));
        const cost = safeCost(house, unit, ingredient.id);
        if (cost !== null) return { source: house, cost, unit, isHouse: true };
    }
    let best: IngredientCost | null = null;
    for (const source of sourcesFor(ingredient.id)) {
        const unit: string = best?.unit ?? displayUnitFor(sourceUnit(source));
        const cost = safeCost(source, unit, ingredient.id);
        if (cost !== null && (best === null || cost < best.cost)) best = { source, cost, unit, isHouse: false };
    }
    return best;
}

// A source's cost, or null instead of crashing if a recipe loop sneaks in
export function safeCost(source: Source, unit: string, ingredientId: string): number | null {
    try {
        return sourceCostPerUnit(source, unit, ingredientId);
    } catch {
        return null;
    }
}
