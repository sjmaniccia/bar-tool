// ===== products.js =====
// The Products screen: the product library, in three levels.
//
//     PRODUCT         what it is      "Tito's Handmade Vodka" · Spirits > Vodka · 40% ABV
//       FORMAT        how it's packed "1.75 L bottle" (inventory is counted in these)
//         PURCHASE    how you buy it  "case of 6 from RNDC, $204" (orders and prices use these)
//
// One form adds all three at once. If the product or format already exists,
// the form adds to it, so the same bottle can have several ways to buy it.

import { db, commit } from "./storage.js";
import { addPrice, currentPrice, deletePricesFor } from "./prices.js";
import { PURCHASE_UNITS, displayUnitFor, fillUnitSelect } from "./units.js";
import { sortedVendors } from "./vendors.js";
import { getOrCreateIngredient } from "./ingredients.js";
import { formatName, pricePerContainer, sourceCostPerUnit } from "./costing.js";
import {
    makeId, now, findById, formatMoney, formatAmount, parseAmount,
    readField, writeField, makeElement, makeButton, resetList
} from "./utils.js";


// Starting choices for the top level of organization (any new one typed is kept)
export const FAMILIES = [
    "Spirits", "Wine", "Beer", "Non-alcoholic", "Produce", "Meat & seafood",
    "Dairy", "Dry goods", "Brewing", "Paper products", "Other"
];


// ===== Data =====

// All products, A-Z by name
export function sortedProducts() {
    return db.products.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });
}

// Every format of a product, and every purchase unit of a format
function formatsFor(productId) {
    return db.formats.filter(function (f) { return f.productId === productId; });
}
function unitsFor(formatId) {
    return db.purchaseUnits.filter(function (u) { return u.formatId === formatId; });
}

// Find a product by name, ignoring capitals and spaces, or null
function findProductByName(name) {
    const wanted = name.trim().toLowerCase();
    return db.products.find(function (p) { return p.name.toLowerCase() === wanted; }) || null;
}

// Find a product's format with the same size, unit and packaging, or null
function findFormat(productId, unitSize, sizeUnit, packaging) {
    return db.formats.find(function (f) {
        return f.productId === productId && f.unitSize === unitSize && f.sizeUnit === sizeUnit
            && f.packaging.toLowerCase() === packaging.toLowerCase();
    }) || null;
}

// Save everything from the form
//     FIND or CREATE the product
//     FIND or CREATE the format under it
//     CREATE the purchase unit under that, with its first price
function addFromForm(productFields, formatFields, unitFields, price) {
    let product = findProductByName(productFields.name);
    if (product === null) {
        product = productFields;
        product.id = makeId();
        db.products.push(product);
    }

    let format = findFormat(product.id, formatFields.unitSize, formatFields.sizeUnit, formatFields.packaging);
    if (format === null) {
        format = formatFields;
        format.id = makeId();
        format.productId = product.id;
        db.formats.push(format);
    }

    unitFields.id = makeId();
    unitFields.formatId = format.id;
    db.purchaseUnits.push(unitFields);
    addPrice(unitFields.id, price, now());
    commit();
}

// Ask for a new price and record it as of now (several in one day is fine)
// FIXME: prompt() is quick but ugly. Replace with an inline form later.
function updatePrice(unitId) {
    const answer = prompt("New price:", currentPrice(unitId).toFixed(2));
    if (answer === null) {
        return;   // they clicked Cancel
    }
    const amount = parseFloat(answer);
    if (isNaN(amount) || amount < 0) {
        alert("That's not a valid price.");
        return;
    }
    addPrice(unitId, amount, now());
    commit();
}

// Remove one purchase unit, its prices, and any choices pointing at it
// (recipes using it fall back to the house choice or cheapest)
function removeUnit(unitId) {
    db.purchaseUnits = db.purchaseUnits.filter(function (u) { return u.id !== unitId; });
    deletePricesFor(unitId);
    for (const ingredient of db.ingredients) {
        if (ingredient.housePurchaseUnitId === unitId) {
            ingredient.housePurchaseUnitId = null;
        }
    }
    for (const line of db.recipeLines) {
        if (line.choicePurchaseUnitId === unitId) {
            line.choicePurchaseUnitId = null;
        }
    }
}

// Delete a purchase unit (after asking)
function deleteUnit(unitId) {
    if (!confirm("Delete this purchase unit? Recipes using it will switch to the house choice or cheapest.")) {
        return;
    }
    removeUnit(unitId);
    commit();
}

// Delete a format and every purchase unit under it (after asking)
function deleteFormat(formatId) {
    if (!confirm("Delete this format and every way to buy it?")) {
        return;
    }
    for (const unit of unitsFor(formatId)) {
        removeUnit(unit.id);
    }
    db.formats = db.formats.filter(function (f) { return f.id !== formatId; });
    commit();
}

// Delete a product, its formats, and their purchase units (after asking)
function deleteProduct(productId) {
    const product = findById(db.products, productId);
    if (product === null || !confirm("Delete " + product.name + " and all its formats?")) {
        return;
    }
    for (const format of formatsFor(productId)) {
        for (const unit of unitsFor(format.id)) {
            removeUnit(unit.id);
        }
    }
    db.formats = db.formats.filter(function (f) { return f.productId !== productId; });
    db.products = db.products.filter(function (p) { return p.id !== productId; });
    commit();
}

// FIXME: Edit a product, format or purchase unit
// FIXME: Active/inactive status, UPC, region, vintage, tasting notes
// FIXME (Phase 3): low/high pars on formats, for ordering


// ===== Drawing =====

// One purchase unit row:
//     "case of 6 · RNDC · SKU 4412 — $204.00 ($34.00/bottle · $0.58/fl oz)"
function makeUnitRow(unit, format, product) {
    const row = makeElement("li", "option");
    const info = makeElement("div");

    const vendor = findById(db.vendors, unit.vendorId);
    const parts = [unit.unitAmount === 1 ? unit.name : unit.name + " of " + unit.unitAmount];
    if (vendor !== null) parts.push(vendor.companyName);
    if (unit.sku !== "") parts.push("SKU " + unit.sku);

    // Price, then what it works out to per container and per fl oz / lb / each
    const container = format.packaging === "" ? "unit" : format.packaging;
    const displayUnit = displayUnitFor(format.sizeUnit);
    const perUnit = sourceCostPerUnit({ kind: "unit", unit: unit }, displayUnit, product.ingredientId);
    let priceText = formatMoney(currentPrice(unit.id));
    if (unit.unitAmount > 1) {
        priceText += " (" + formatMoney(pricePerContainer(unit)) + "/" + container;
        priceText += perUnit === null ? ")" : " · " + formatMoney(perUnit) + "/" + displayUnit + ")";
    } else if (perUnit !== null) {
        priceText += " (" + formatMoney(perUnit) + "/" + displayUnit + ")";
    }

    info.append(makeElement("span", "", parts.join(" · ")));
    info.append(makeElement("span", "details", priceText));
    row.append(info);

    // When New price is clicked, ask for a price. When Delete is clicked, delete it.
    const buttons = makeElement("div", "buttons");
    buttons.append(
        makeButton("New price", "secondary small", function () { updatePrice(unit.id); }),
        makeButton("Delete", "danger small", function () { deleteUnit(unit.id); })
    );
    row.append(buttons);
    return row;
}

// One product's block: name, organization, ingredient, then each format and its purchase units
function makeProductItem(product) {
    const li = makeElement("li", "product");

    // "Tito's Handmade Vodka" and "Spirits › Vodka · for Vodka · 40% ABV"
    const header = makeElement("div", "recipe-header");
    header.append(makeElement("strong", "", product.name));
    li.append(header);

    const organization = [product.family, product.category, product.subcategory].filter(function (x) { return x; });
    const details = [organization.join(" › ")];
    const ingredient = findById(db.ingredients, product.ingredientId);
    if (ingredient !== null) details.push("ingredient: " + ingredient.name);
    if (product.producer) details.push(product.producer);
    if (product.abv !== null) details.push(formatAmount(product.abv) + "% ABV");
    li.append(makeElement("span", "details", details.join(" · ")));

    // Each format, with its purchase units under it
    for (const format of formatsFor(product.id)) {
        const block = makeElement("div", "format");
        const formatHeader = makeElement("div", "line");
        let formatText = formatName(format);
        if (format.yieldPercent < 100) {
            formatText += " · " + formatAmount(format.yieldPercent) + "% yield";
        }
        formatHeader.append(makeElement("span", "format-name", formatText));
        formatHeader.append(makeButton("Delete format", "secondary small", function () { deleteFormat(format.id); }));
        block.append(formatHeader);

        const units = makeElement("ul", "line-list");
        for (const unit of unitsFor(format.id)) {
            units.append(makeUnitRow(unit, format, product));
        }
        block.append(units);
        li.append(block);
    }

    // When Delete product is clicked, delete it and everything under it
    const buttons = makeElement("div", "buttons");
    buttons.append(makeButton("Delete product", "danger", function () { deleteProduct(product.id); }));
    li.append(buttons);
    return li;
}

// Fill a <datalist> with suggestions: the defaults plus anything already typed
function fillSuggestions(listId, values) {
    const list = document.getElementById(listId);
    list.innerHTML = "";
    const seen = new Set();
    for (const value of values) {
        if (value && !seen.has(value)) {
            seen.add(value);
            list.append(new Option(value));
        }
    }
}

// Rebuild the vendor dropdown, keeping the current choice
//     IF the chosen vendor was deleted, fall back to "No vendor"
function renderVendorOptions() {
    const select = document.getElementById("pu-vendor");
    const previous = select.value;
    select.innerHTML = "";
    select.append(new Option("No vendor", ""));
    for (const v of sortedVendors()) {
        select.append(new Option(v.companyName, v.id));
    }
    select.value = previous;
    if (select.value !== previous) {
        select.value = "";
    }
}

// Redraw the Products screen
export function renderProducts() {
    renderVendorOptions();

    // Suggestions for the organization boxes
    fillSuggestions("family-names", FAMILIES.concat(db.products.map(function (p) { return p.family; })));
    fillSuggestions("category-names", db.products.map(function (p) { return p.category; }));
    fillSuggestions("subcategory-names", db.products.map(function (p) { return p.subcategory; }));
    fillSuggestions("product-names", db.products.map(function (p) { return p.name; }));

    const list = resetList("product-list", "product-empty", db.products.length);
    for (const product of sortedProducts()) {
        list.append(makeProductItem(product));
    }
}


// ===== Setup (runs once on page load) =====

export function initProducts() {
    fillUnitSelect(document.getElementById("fmt-unit"), PURCHASE_UNITS, "ml");

    // When the form is submitted, save the product, format and purchase unit
    document.getElementById("product-form").addEventListener("submit", function (event) {
        event.preventDefault();   // stop the page from reloading

        const name = readField("prod-name");
        const ingredientName = readField("prod-ingredient");
        const abvText = readField("prod-abv");
        const productFields = {
            name: name,
            ingredientId: ingredientName === "" ? null : getOrCreateIngredient(ingredientName).id,
            family: readField("prod-family") || "Other",
            category: readField("prod-category"),
            subcategory: readField("prod-subcategory"),
            producer: readField("prod-producer"),
            abv: abvText === "" ? null : parseFloat(abvText)
        };
        const formatFields = {
            unitSize: parseAmount(readField("fmt-size")),
            sizeUnit: readField("fmt-unit"),
            packaging: readField("fmt-packaging"),
            yieldPercent: parseFloat(readField("fmt-yield"))
        };
        const unitFields = {
            name: readField("pu-name") || "case",
            unitAmount: parseInt(readField("pu-amount")),
            vendorId: readField("pu-vendor") || null,   // "" (none picked) becomes null
            sku: readField("pu-sku")
        };
        const price = parseFloat(readField("pu-price"));

        // Stop if anything required is missing or not a number
        if (name === "" || isNaN(formatFields.unitSize) || formatFields.unitSize <= 0
            || isNaN(formatFields.yieldPercent) || isNaN(unitFields.unitAmount)
            || unitFields.unitAmount < 1 || isNaN(price)) {
            alert("Fill in the name, size, how many per purchase, and price.");
            return;
        }

        addFromForm(productFields, formatFields, unitFields, price);

        // Clear the purchase details only, so adding another way to buy the
        // same bottle (single vs case, another vendor) is quick
        writeField("pu-sku", "");
        writeField("pu-price", "");
        document.getElementById("pu-price").focus();
    });
}
