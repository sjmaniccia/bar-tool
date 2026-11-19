// ===== ingredients.js =====
// The Ingredients screen: what recipes ask for ("Vodka", "Lemon", "Lime juice"),
// every source for each one, the house choice, and conversions.
//
// An ingredient is { id, name, housePurchaseUnitId, houseRecipeId }
// Sources (see costing.js) are purchase units you buy, or prep recipes that make it.
// "Lime juice" can have bottled juice products AND a "Fresh lime juice" recipe,
// compared side by side, and either one can be the house choice.
//
// Conversions connect different kinds of units for one ingredient:
//     Lemon: 1 each = 0.25 lb   (so "2 lemons" can be costed from a case sold by weight)

import { db, commit } from "./storage.js";
import { PURCHASE_UNITS, displayUnitFor, fillUnitSelect } from "./units.js";
import {
    sourcesFor, sourceId, sourceName, sourceUnit, sourceCostPerUnit,
    houseSource, conversionsFor
} from "./costing.js";
import {
    makeId, findById, formatMoney, formatFraction, parseAmount, readField,
    makeElement, makeButton, resetList
} from "./utils.js";


// ===== Data =====

// All ingredients, A-Z by name
export function sortedIngredients() {
    return db.ingredients.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });
}

// Find an ingredient by name, ignoring capitals and extra spaces ("vodka" = "Vodka ")
export function findIngredientByName(name) {
    const wanted = name.trim().toLowerCase();
    for (const ingredient of db.ingredients) {
        if (ingredient.name.toLowerCase() === wanted) {
            return ingredient;
        }
    }
    return null;
}

// Find an ingredient by name
//     IF it doesn't exist, create it (not saved until the next commit)
export function getOrCreateIngredient(name) {
    const existing = findIngredientByName(name);
    if (existing !== null) {
        return existing;
    }
    const ingredient = { id: makeId(), name: name.trim(), housePurchaseUnitId: null, houseRecipeId: null };
    db.ingredients.push(ingredient);
    return ingredient;
}

// The unit a recipe line should start on for this ingredient:
// its first source's unit, or fl oz if it has none yet
export function defaultUnitFor(ingredientId) {
    const sources = sourcesFor(ingredientId);
    return sources.length === 0 ? "fl oz" : sourceUnit(sources[0]);
}

// Units a recipe line can use: any unit (conversions decide what can be costed)
export function unitsForIngredient() {
    return PURCHASE_UNITS;
}

// Count the recipe lines that use this ingredient
function linesUsingIngredient(ingredientId) {
    let count = 0;
    for (const line of db.recipeLines) {
        if (line.ingredientId === ingredientId) {
            count++;
        }
    }
    return count;
}

// Make a source the house choice (or pass null to clear it)
function setHouse(ingredientId, source) {
    const ingredient = findById(db.ingredients, ingredientId);
    if (ingredient === null) {
        return;
    }
    ingredient.housePurchaseUnitId = source !== null && source.kind === "unit" ? source.unit.id : null;
    ingredient.houseRecipeId = source !== null && source.kind === "recipe" ? source.recipe.id : null;
    commit();
}

// Save a conversion like "1 each = 0.25 lb"
function addConversion(ingredientId, fromAmount, fromUnit, toAmount, toUnit) {
    db.ingredientConversions.push({
        id: makeId(),
        ingredientId: ingredientId,
        fromAmount: fromAmount,
        fromUnit: fromUnit,
        toAmount: toAmount,
        toUnit: toUnit
    });
    commit();
}

function removeConversion(conversionId) {
    db.ingredientConversions = db.ingredientConversions.filter(function (c) {
        return c.id !== conversionId;
    });
    commit();
}

// Delete an ingredient
//     IF any product, recipe line or recipe uses it, refuse
//     ELSE ask to confirm, then delete it and its conversions
function deleteIngredient(ingredientId) {
    const ingredient = findById(db.ingredients, ingredientId);
    if (ingredient === null) {
        return;
    }
    // Products for this ingredient (even ones with no purchase units yet), plus in-house recipes
    const productCount = db.products.filter(function (p) { return p.ingredientId === ingredientId; }).length;
    const sourceCount = Math.max(productCount, sourcesFor(ingredientId).length);
    const lineCount = linesUsingIngredient(ingredientId);
    if (sourceCount > 0 || lineCount > 0) {
        alert("Can't delete " + ingredient.name + ". "
            + sourceCount + " source(s) and " + lineCount + " recipe line(s) use it.");
        return;
    }
    if (!confirm("Delete " + ingredient.name + "?")) {
        return;
    }
    db.ingredients = db.ingredients.filter(function (i) {
        return i.id !== ingredientId;
    });
    db.ingredientConversions = db.ingredientConversions.filter(function (c) {
        return c.ingredientId !== ingredientId;
    });
    commit();
}

// FIXME: Rename an ingredient


// ===== Drawing =====

// One source row: "Lime juice 1 L · RNDC · $0.25/fl oz", tags, difference
// from the house choice, and a button to make it the house choice
function makeSourceRow(source, ingredient, unit, cheapestCost, houseCost) {
    const row = makeElement("li", "option");
    const info = makeElement("div");

    const cost = sourceCostPerUnit(source, unit, ingredient.id);
    const costText = cost === null
        ? "needs a conversion (made/bought in " + sourceUnit(source) + ")"
        : formatMoney(cost) + "/" + unit;
    info.append(makeElement("span", "", sourceName(source) + " · " + costText));

    // Tags
    const house = houseSource(ingredient);
    const isHouse = house !== null && house.kind === source.kind && sourceId(house) === sourceId(source);
    if (isHouse) {
        info.append(" ", makeElement("span", "tag house", "house"));
    }
    if (cost !== null && cost === cheapestCost) {
        info.append(" ", makeElement("span", "tag cheapest", "cheapest"));
    }

    // Difference from the house choice, per unit: "+$0.12/fl oz vs house"
    if (houseCost !== null && cost !== null && !isHouse) {
        const diff = cost - houseCost;
        const sign = diff < 0 ? "−" : "+";
        info.append(makeElement("span", "details",
            sign + formatMoney(Math.abs(diff)) + "/" + unit + " vs house"));
    }
    row.append(info);

    // When Make house is clicked, make this the house choice
    if (isHouse) {
        row.append(makeButton("Clear house", "secondary small", function () { setHouse(ingredient.id, null); }));
    } else {
        row.append(makeButton("Make house", "secondary small", function () { setHouse(ingredient.id, source); }));
    }
    return row;
}

// The conversions list and a small form: [1] [each] = [0.25] [lb] [Add]
function makeConversionsBlock(ingredient) {
    const block = makeElement("div", "conversions");

    for (const c of conversionsFor(ingredient.id)) {
        const row = makeElement("div", "line");
        row.append(makeElement("span", "details",
            formatFraction(c.fromAmount) + " " + c.fromUnit + " = " + formatFraction(c.toAmount) + " " + c.toUnit));
        // When Remove is clicked, remove this conversion
        row.append(makeButton("Remove", "secondary small", function () { removeConversion(c.id); }));
        block.append(row);
    }

    const form = makeElement("form", "conversion-form");
    const fromAmount = document.createElement("input");
    fromAmount.type = "text";
    fromAmount.value = "1";
    const fromUnit = document.createElement("select");
    fillUnitSelect(fromUnit, PURCHASE_UNITS, "each");
    const toAmount = document.createElement("input");
    toAmount.type = "text";
    toAmount.placeholder = "1/4";
    const toUnit = document.createElement("select");
    fillUnitSelect(toUnit, PURCHASE_UNITS, "lb");
    const addButton = makeElement("button", "small", "Add");
    addButton.type = "submit";
    form.append(fromAmount, fromUnit, makeElement("span", "", "="), toAmount, toUnit, addButton);

    // When the conversion form is submitted, save it
    //     IF either amount isn't a number, or both units are the same, stop
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        const a = parseAmount(fromAmount.value);
        const b = parseAmount(toAmount.value);
        if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0 || fromUnit.value === toUnit.value) {
            alert("Enter two amounts, like 1 each = 1/4 lb.");
            return;
        }
        addConversion(ingredient.id, a, fromUnit.value, b, toUnit.value);
    });

    block.append(form);
    return block;
}

// One ingredient's block: name, every source cheapest first, conversions
function makeIngredientItem(ingredient) {
    const li = makeElement("li", "ingredient");

    const header = makeElement("div", "recipe-header");
    header.append(makeElement("strong", "", ingredient.name));
    header.append(makeElement("span", "details", "In " + linesUsingIngredient(ingredient.id) + " recipe line(s)"));
    li.append(header);

    const sources = sourcesFor(ingredient.id);
    if (sources.length === 0) {
        li.append(makeElement("span", "details warn",
            "No sources yet. Add a product for \"" + ingredient.name
            + "\" on the Products tab, or a prep recipe that makes it."));
    } else {
        // Compare everything in the first source's display unit (fl oz, lb, each)
        const unit = displayUnitFor(sourceUnit(sources[0]));

        // Cost of each source, then sort cheapest first (unpriceable ones last)
        const costs = new Map();
        for (const source of sources) {
            costs.set(source, sourceCostPerUnit(source, unit, ingredient.id));
        }
        sources.sort(function (a, b) {
            const ca = costs.get(a), cb = costs.get(b);
            if (ca === null) return 1;
            if (cb === null) return -1;
            return ca - cb;
        });
        const cheapestCost = costs.get(sources[0]);

        const house = houseSource(ingredient);
        const houseCost = house === null ? null : sourceCostPerUnit(house, unit, ingredient.id);
        if (house === null) {
            li.append(makeElement("span", "details", "No house choice: recipes use the cheapest as an estimate"));
        }

        const options = makeElement("ul", "line-list");
        for (const source of sources) {
            options.append(makeSourceRow(source, ingredient, unit, cheapestCost, houseCost));
        }
        li.append(options);
    }

    li.append(makeElement("span", "details", "Conversions (only needed between kinds of units, like each and lb)"));
    li.append(makeConversionsBlock(ingredient));

    // When Delete is clicked, delete this ingredient
    const buttons = makeElement("div", "buttons");
    buttons.append(makeButton("Delete", "danger", function () { deleteIngredient(ingredient.id); }));
    li.append(buttons);

    return li;
}

// Redraw the Ingredients screen, and the ingredient name suggestions used by forms
export function renderIngredients() {
    const list = resetList("ingredient-list", "ingredient-empty", db.ingredients.length);
    for (const ingredient of sortedIngredients()) {
        try {
            list.append(makeIngredientItem(ingredient));
        } catch (error) {
            // A recipe loop through an in-house source; show it instead of crashing
            list.append(makeElement("li", "details warn", ingredient.name + ": can't cost (recipe loop)"));
        }
    }

    const suggestions = document.getElementById("ingredient-names");
    suggestions.innerHTML = "";
    for (const ingredient of sortedIngredients()) {
        suggestions.append(new Option(ingredient.name));
    }
}


// ===== Setup (runs once on page load) =====

export function initIngredients() {
    // When the form is submitted, add the ingredient (if it's new)
    document.getElementById("ingredient-form").addEventListener("submit", function (event) {
        event.preventDefault();   // stop the page from reloading
        const name = readField("ingredient-name");
        if (name === "") {
            return;
        }
        getOrCreateIngredient(name);
        event.target.reset();
        commit();
    });
}
