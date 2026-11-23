// ===== storage.ts =====
// Holds all the app's data and saves it in the browser.
// Same idea as before: change `db`, then call commit() to save and redraw.

import { useSyncExternalStore } from "react";
import type { Database } from "./types";
import { makeId } from "./utils";

// Name the data is saved under (kept from earlier versions so nothing is lost)
const STORAGE_KEY = "barTool.data.v3";

export function emptyData(): Database {
    return {
        vendors: [],
        ingredients: [],
        ingredientConversions: [],
        products: [],
        formats: [],
        purchaseUnits: [],
        priceEntries: [],
        recipes: [],
        recipeLines: [],
        areas: [],
        stockCounts: [],
        countLines: [],
        orders: [],
        orderLines: [],
        invoices: [],
        invoiceLines: [],
        menus: [],
        menuItems: [],
        salesImports: [],
        salesLines: [],
        posLinks: [],
        invoiceItemLinks: [],
        invoiceCharges: [],
        wasteEntries: []
    };
}

// Old saves can be any shape, so they're read loosely, upgraded, then trusted
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OldSave = Record<string, any>;

// Load saved data
//     IF nothing saved, return empty tables
//     ELSE bring older saves up to date, then copy each table in
export function loadData(saved: string | null = readSaved()): Database {
    const data = emptyData();
    if (saved === null) {
        return data;
    }
    try {
        const old: OldSave = JSON.parse(saved);
        upgradePriceEntries(old);
        upgradeToIngredients(old);
        upgradeToProducts(old);
        fillNewFields(old);
        for (const table of Object.keys(data) as (keyof Database)[]) {
            if (Array.isArray(old[table])) {
                data[table] = old[table];
            }
        }
    } catch (error) {
        console.log("Could not load saved data:", error);   // broken save: start empty
    }
    return data;
}

function readSaved(): string | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}


// ===== Upgrades for older saves (oldest change first) =====

// First version prices: { itemId, date, amount }
function upgradePriceEntries(old: OldSave) {
    for (const entry of old.priceEntries ?? []) {
        if (entry.recordedAt === undefined) {
            entry.recordedAt = entry.date;
            delete entry.date;
        }
        entry.id ??= makeId();   // ??= means "set it only if it's missing"
    }
}

// Before ingredients: each item becomes its own ingredient (item = house choice)
function upgradeToIngredients(old: OldSave) {
    if (!Array.isArray(old.items)) {
        return;
    }
    old.ingredients ??= [];
    for (const item of old.items) {
        if (item.ingredientId === undefined) {
            const ingredient = { id: makeId(), name: item.name, houseItemId: item.id, houseRecipeId: null };
            old.ingredients.push(ingredient);
            item.ingredientId = ingredient.id;
        }
    }
    for (const line of old.recipeLines ?? []) {
        if (line.itemId !== undefined) {
            const item = old.items.find((i: OldSave) => i.id === line.itemId);
            line.ingredientId = item ? item.ingredientId : null;
            delete line.itemId;
        }
    }
}

const FAMILY_FROM_CATEGORY: Record<string, string> = {
    "Liquor": "Spirits", "Wine": "Wine", "Beer": "Beer", "Mixer": "Non-alcoholic",
    "Produce": "Produce", "Meat": "Meat & seafood", "Seafood": "Meat & seafood",
    "Dairy": "Dairy", "Dry goods": "Dry goods", "Brewing": "Brewing",
    "Paper products": "Paper products", "Other": "Other"
};

// Before the product library: each item -> product + format + purchase unit
// (the purchase unit keeps the item's id, so prices and choices still point to it)
function upgradeToProducts(old: OldSave) {
    if (Array.isArray(old.distributors)) {
        old.vendors = old.distributors;
        delete old.distributors;
    }
    if (!Array.isArray(old.items)) {
        return;
    }
    old.products ??= [];
    old.formats ??= [];
    old.purchaseUnits ??= [];
    for (const item of old.items) {
        const productId = makeId();
        const formatId = makeId();
        old.products.push({
            id: productId, ingredientId: item.ingredientId, name: item.name,
            family: FAMILY_FROM_CATEGORY[item.category] ?? "Other",
            category: "", subcategory: "", producer: "", abv: null
        });
        old.formats.push({
            id: formatId, productId, unitSize: item.packSize, sizeUnit: item.sizeUnit,
            packaging: "", yieldPercent: item.yieldPercent
        });
        old.purchaseUnits.push({
            id: item.id, formatId, vendorId: item.distributorId,
            name: item.packCount === 1 ? "single" : "case", unitAmount: item.packCount, sku: ""
        });
    }
    delete old.items;
    for (const entry of old.priceEntries ?? []) {
        if (entry.itemId !== undefined) {
            entry.purchaseUnitId = entry.itemId;
            delete entry.itemId;
        }
    }
    for (const ingredient of old.ingredients ?? []) {
        if (ingredient.houseItemId !== undefined) {
            ingredient.housePurchaseUnitId = ingredient.houseItemId;
            delete ingredient.houseItemId;
        }
    }
    for (const line of old.recipeLines ?? []) {
        if (line.choiceItemId !== undefined) {
            line.choicePurchaseUnitId = line.choiceItemId;
            delete line.choiceItemId;
        }
    }
}

// Give older rows any fields added later (all start empty)
function fillNewFields(old: OldSave) {
    for (const vendor of old.vendors ?? []) {
        vendor.repEmail ??= "";
        vendor.orderDays ??= "";
        vendor.notes ??= "";
    }
    for (const format of old.formats ?? []) {
        format.par ??= null;
        format.barcode ??= "";
    }
    for (const product of old.products ?? []) {
        product.notes ??= "";
    }
    for (const ingredient of old.ingredients ?? []) {
        ingredient.housePurchaseUnitId ??= null;
        ingredient.houseRecipeId ??= null;
    }
    for (const recipe of old.recipes ?? []) {
        recipe.producesIngredientId ??= null;
        recipe.photo ??= "";
        recipe.laborWage ??= null;
        recipe.laborMinutes ??= null;
        recipe.glass ??= "";
        recipe.garnish ??= "";
        recipe.description ??= "";
        recipe.directions ??= "";
    }
    for (const line of old.recipeLines ?? []) {
        line.ingredientId ??= null;
        line.subRecipeId ??= null;
        line.choicePurchaseUnitId ??= null;
        line.choiceRecipeId ??= null;
    }
}


// ===== The shared data, saving, and redrawing =====

// The one shared copy of all data. Every file imports this.
export const db: Database = loadData();

// A number that goes up on every change. React compares it to decide when to redraw.
let version = 0;
const listeners = new Set<() => void>();

function notify() {
    version++;
    for (const listener of listeners) {
        listener();
    }
}

// Where commit() saves to.
//     null = this browser only (no account, or the demo)
//     a function = signed in: the cloud sync saves a local copy and sends changes to the server
let saveHook: ((data: Database) => void) | null = null;

export function setSaveHook(hook: ((data: Database) => void) | null) {
    saveHook = hook;
}

// Save, then tell every screen to redraw
export function commit() {
    if (saveHook !== null) {
        saveHook(db);
    } else {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        } catch (error) {
            console.log("Could not save data:", error);
        }
    }
    notify();
}

// Show different data without saving it (used when switching bars or receiving changes)
export function showData(data: Database) {
    Object.assign(db, data);
    notify();
}

// The data saved in this browser without an account (the demo / before signing up)
export function deviceData(): Database {
    return loadData(readSaved());
}

// Replace everything with new data (used for "load sample data")
export function replaceAll(data: Database) {
    Object.assign(db, data);
    commit();
}

// WHEN the app is open in another tab and saves there, reload so both match
if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY && saveHook === null) {
            Object.assign(db, loadData(event.newValue));
            notify();
        }
    });
}

// A React hook: any screen that calls useDb() redraws after every commit().
// useSyncExternalStore is React's built-in way to watch data that lives
// outside React (like our db): subscribe to changes, and read the version.
export function useDb(): Database {
    useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => version
    );
    return db;
}
