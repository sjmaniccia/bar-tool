// ===== storage.js =====
// Holds all the app's data and saves it in the browser.
//
// Data is split into tables that match the ERD:
//     vendors        { id, companyName, companyPhone, street, city, state, zip, repName, repPhone }
//     ingredients    { id, name, housePurchaseUnitId, houseRecipeId }   what a recipe asks for ("Vodka")
//                    house = the bar's chosen source: a purchase unit OR an in-house recipe (or neither)
//     ingredientConversions { id, ingredientId, fromAmount, fromUnit, toAmount, toUnit }
//                    e.g. Lemon: 1 each = 0.25 lb (only true for lemons, so it lives on the ingredient)
//
//     The product library has three levels:
//     products       { id, ingredientId, name, family, category, subcategory, producer, abv }
//                    WHAT it is: "Tito's Handmade Vodka", Spirits > Vodka, 40% ABV
//     formats        { id, productId, unitSize, sizeUnit, packaging, yieldPercent }
//                    HOW it's packaged: a 1.75 L bottle. Inventory is counted in formats.
//     purchaseUnits  { id, formatId, vendorId, name, unitAmount, sku }
//                    HOW you buy it: a "case" of 6 from RNDC. Orders and prices use these.
//                    FIXME (Phase 3): counts can mix cases and bottles,
//                    e.g. 2 cases + 4 bottles + 1/3 open = 2 × unitAmount + 4 + 1/3 bottles
//     priceEntries   { id, purchaseUnitId, amount, recordedAt }   any number per unit, even per day
//
//     recipes        { id, name, type, yieldAmount, yieldUnit, menuPrice, producesIngredientId }
//                    producesIngredientId = the ingredient this prep recipe makes ("Lime juice"), or null
//     recipeLines    { id, recipeId, ingredientId, subRecipeId, choicePurchaseUnitId, choiceRecipeId, amount, unit }
//                    ingredient OR sub-recipe; a choice (purchase unit OR recipe) overrides the house choice

import { makeId } from "./utils.js";

// Name the data is saved under (bump the version if the data's shape changes)
const STORAGE_KEY = "barTool.data.v3";

// Make a fresh set of empty tables
function emptyData() {
    return {
        vendors: [],
        ingredients: [],
        ingredientConversions: [],
        products: [],
        formats: [],
        purchaseUnits: [],
        priceEntries: [],
        recipes: [],
        recipeLines: []
    };
}

// Load saved data from the browser
//     IF nothing saved, return empty tables
//     ELSE bring older saves up to date, then copy each table in
export function loadData() {
    const data = emptyData();
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === null) {
            return data;
        }
        const old = JSON.parse(saved);   // text -> objects

        // Upgrade older saves, oldest change first
        upgradePriceEntries(old);
        upgradeToIngredients(old);
        upgradeToProducts(old);
        fillNewFields(old);

        // Copy each table (any table missing from an old save stays empty)
        for (const table of Object.keys(data)) {
            if (Array.isArray(old[table])) {
                data[table] = old[table];
            }
        }
    } catch (error) {
        // If the saved data is broken, start empty instead of crashing
        console.log("Could not load saved data:", error);
    }
    return data;
}


// ===== Upgrades for older saves =====

// Prices from the first version ({ itemId, date, amount })
//     IF an entry has no recordedAt, use its old date
//     IF an entry has no id, give it one
function upgradePriceEntries(old) {
    for (const entry of old.priceEntries || []) {
        if (entry.recordedAt === undefined) {
            entry.recordedAt = entry.date;
            delete entry.date;
        }
        if (entry.id === undefined) {
            entry.id = makeId();
        }
    }
}

// Data from before ingredients existed
//     FOR EACH item with no ingredient, CREATE one with the item's name (item = house choice)
//     FOR EACH recipe line that pointed at an item, POINT it at that item's ingredient
function upgradeToIngredients(old) {
    if (!Array.isArray(old.items)) {
        return;
    }
    old.ingredients = old.ingredients || [];
    for (const item of old.items) {
        if (item.ingredientId === undefined) {
            const ingredient = { id: makeId(), name: item.name, houseItemId: item.id, houseRecipeId: null };
            old.ingredients.push(ingredient);
            item.ingredientId = ingredient.id;
        }
    }
    for (const line of old.recipeLines || []) {
        if (line.itemId !== undefined) {
            const item = old.items.find(function (i) { return i.id === line.itemId; });
            line.ingredientId = item ? item.ingredientId : null;
            delete line.itemId;
        }
    }
}

// Old single categories -> the new top-level family
const FAMILY_FROM_CATEGORY = {
    "Liquor": "Spirits", "Wine": "Wine", "Beer": "Beer", "Mixer": "Non-alcoholic",
    "Produce": "Produce", "Meat": "Meat & seafood", "Seafood": "Meat & seafood",
    "Dairy": "Dairy", "Dry goods": "Dry goods", "Brewing": "Brewing",
    "Paper products": "Paper products", "Other": "Other"
};

// Data from before the product library (items + distributors)
//     distributors become vendors
//     FOR EACH item, CREATE a product, a format, and a purchase unit
//         the purchase unit keeps the item's id, so prices and choices still point to it
function upgradeToProducts(old) {
    if (Array.isArray(old.distributors)) {
        old.vendors = old.distributors;
        delete old.distributors;
    }
    if (!Array.isArray(old.items)) {
        return;
    }
    old.products = old.products || [];
    old.formats = old.formats || [];
    old.purchaseUnits = old.purchaseUnits || [];

    for (const item of old.items) {
        const product = {
            id: makeId(),
            ingredientId: item.ingredientId,
            name: item.name,
            family: FAMILY_FROM_CATEGORY[item.category] || "Other",
            category: "",
            subcategory: "",
            producer: "",
            abv: null
        };
        const format = {
            id: makeId(),
            productId: product.id,
            unitSize: item.packSize,
            sizeUnit: item.sizeUnit,
            packaging: "",
            yieldPercent: item.yieldPercent
        };
        const purchaseUnit = {
            id: item.id,
            formatId: format.id,
            vendorId: item.distributorId,
            name: item.packCount === 1 ? "single" : "case",
            unitAmount: item.packCount,
            sku: ""
        };
        old.products.push(product);
        old.formats.push(format);
        old.purchaseUnits.push(purchaseUnit);
    }
    delete old.items;

    // Item ids are now purchase unit ids
    for (const entry of old.priceEntries || []) {
        if (entry.itemId !== undefined) {
            entry.purchaseUnitId = entry.itemId;
            delete entry.itemId;
        }
    }
    for (const ingredient of old.ingredients || []) {
        if (ingredient.houseItemId !== undefined) {
            ingredient.housePurchaseUnitId = ingredient.houseItemId;
            delete ingredient.houseItemId;
        }
    }
    for (const line of old.recipeLines || []) {
        if (line.choiceItemId !== undefined) {
            line.choicePurchaseUnitId = line.choiceItemId;
            delete line.choiceItemId;
        }
    }
}

// Give older saved rows any fields added later (all start empty)
function fillNewFields(old) {
    for (const ingredient of old.ingredients || []) {
        if (ingredient.housePurchaseUnitId === undefined) ingredient.housePurchaseUnitId = null;
        if (ingredient.houseRecipeId === undefined) ingredient.houseRecipeId = null;
    }
    for (const recipe of old.recipes || []) {
        if (recipe.producesIngredientId === undefined) recipe.producesIngredientId = null;
    }
    for (const line of old.recipeLines || []) {
        if (line.ingredientId === undefined) line.ingredientId = null;
        if (line.choicePurchaseUnitId === undefined) line.choicePurchaseUnitId = null;
        if (line.choiceRecipeId === undefined) line.choiceRecipeId = null;
    }
}


// The one shared copy of all data. Every file imports this.
export const db = loadData();

// Save all data to the browser as text
function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));   // objects -> text
    } catch (error) {
        console.log("Could not save data:", error);
    }
}


// ===== Change notifications =====
// Any file that changes data calls commit()
// commit() saves, then runs every function registered with onChange()
// (main.js registers renderAll, so every save redraws every screen)

const listeners = [];

// Remember a function to run after every save
export function onChange(listener) {
    listeners.push(listener);
}

// Save, then run every remembered function
export function commit() {
    saveData();
    for (const listener of listeners) {
        listener();
    }
}
