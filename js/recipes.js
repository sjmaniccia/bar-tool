// ===== recipes.js =====
// Everything for the Recipes screen: cocktails, dishes, beers, and prep
// recipes (simple syrup, lime juice, marinara, wort) used inside others.
//
// A recipe is one row in db.recipes:
//     { id, name, type, yieldAmount, yieldUnit, menuPrice }
// Each ingredient is one row in db.recipeLines, using an item OR a
// sub-recipe:
//     { id, recipeId, itemId, subRecipeId, amount, unit }
//
// Recipes never store their own cost. It's calculated fresh from the
// newest item prices, so one price change recosts everything that uses it.

import { db, commit } from "./storage.js";
import { costPerUnit } from "./prices.js";
import { sortedItems } from "./items.js";
import {
    YIELD_UNITS, familyOf, unitsInFamily, convert, fillUnitSelect
} from "./units.js";
import {
    makeId, findById, formatMoney, formatAmount, readField,
    makeElement, makeButton, resetList
} from "./utils.js";

export const RECIPE_TYPES = ["Cocktail", "Dish", "Beer", "Prep"];

// Target cost % for the suggested price. Typical industry ranges:
// cocktails ~18-24%, draft beer ~20-25%, food ~28-35%.
// FIXME: Let the user set their own targets.
const TARGET_COST = {
    Cocktail: 0.20,
    Beer: 0.25,
    Dish: 0.30,
    Prep: 0.30
};

// Cost % this far above target is shown as a warning
const WARN_MARGIN = 0.05;


// ===== Math =====

function linesFor(recipeId) {
    const result = [];
    for (const line of db.recipeLines) {
        if (line.recipeId === recipeId) {
            result.push(line);
        }
    }
    return result;
}

// Cost of one line. Item lines use the item's cost per unit.
// Sub-recipe lines use (sub-recipe cost ÷ what it yields) × amount used.
function lineCost(line, inProgress) {
    if (line.itemId !== null) {
        const item = findById(db.items, line.itemId);
        if (item === null) {
            return 0;
        }
        const perUnit = costPerUnit(item, line.unit);
        if (perUnit === null) {
            return 0; // units in different families; the form prevents this
        }
        return perUnit * line.amount;
    }

    const sub = findById(db.recipes, line.subRecipeId);
    if (sub === null || sub.yieldAmount <= 0) {
        return 0;
    }
    const amountInYieldUnits = convert(line.amount, line.unit, sub.yieldUnit);
    if (amountInYieldUnits === null) {
        return 0;
    }
    // RECURSION: costing this recipe means costing the sub-recipe first
    return recipeCost(sub.id, inProgress) / sub.yieldAmount * amountInYieldUnits;
}

// Total cost of one batch of a recipe.
// inProgress holds every recipe currently being costed further up the
// chain. Meeting one of them again means a loop (A uses B uses A).
export function recipeCost(recipeId, inProgress = new Set()) {
    if (inProgress.has(recipeId)) {
        throw new Error("Recipe loop found");
    }
    inProgress.add(recipeId);

    let total = 0;
    for (const line of linesFor(recipeId)) {
        total = total + lineCost(line, inProgress);
    }

    inProgress.delete(recipeId);
    return total;
}

// Cost of one serving, or null if the recipe isn't measured in servings
function costPerServing(recipe) {
    if (recipe.yieldUnit !== "serving" || recipe.yieldAmount <= 0) {
        return null;
    }
    return recipeCost(recipe.id) / recipe.yieldAmount;
}

// Does `recipeId` use `targetId`, directly or through sub-recipes?
// Used to block adding a sub-recipe that would create a loop.
// `visited` stops it re-checking a recipe it has already looked at.
function usesRecipe(recipeId, targetId, visited = new Set()) {
    if (recipeId === targetId) {
        return true;
    }
    if (visited.has(recipeId)) {
        return false;
    }
    visited.add(recipeId);

    for (const line of linesFor(recipeId)) {
        if (line.subRecipeId !== null && usesRecipe(line.subRecipeId, targetId, visited)) {
            return true;
        }
    }
    return false;
}

// How many lines in other recipes use this one (blocks deleting it)
function linesUsingRecipe(recipeId) {
    let count = 0;
    for (const line of db.recipeLines) {
        if (line.subRecipeId === recipeId) {
            count++;
        }
    }
    return count;
}


// ===== Data =====

function addRecipe(fields) {
    fields.id = makeId();
    db.recipes.push(fields);
    commit();
}

// One line per recipe + source. Adding the same source again replaces it.
function setLine(recipeId, itemId, subRecipeId, amount, unit) {
    for (const line of db.recipeLines) {
        if (line.recipeId === recipeId && line.itemId === itemId
            && line.subRecipeId === subRecipeId) {
            line.amount = amount;
            line.unit = unit;
            commit();
            return;
        }
    }
    db.recipeLines.push({
        id: makeId(),
        recipeId: recipeId,
        itemId: itemId,
        subRecipeId: subRecipeId,
        amount: amount,
        unit: unit
    });
    commit();
}

function removeLine(lineId) {
    db.recipeLines = db.recipeLines.filter(function (line) {
        return line.id !== lineId;
    });
    commit();
}

// FIXME: prompt() is quick but ugly. Replace with an inline form later.
function changeMenuPrice(recipeId) {
    const recipe = findById(db.recipes, recipeId);
    if (recipe === null) {
        return;
    }

    const current = recipe.menuPrice === null ? "" : recipe.menuPrice.toFixed(2);
    const answer = prompt("Menu price per serving for " + recipe.name + " (blank for none):", current);
    if (answer === null) {
        return; // user hit cancel
    }

    if (answer.trim() === "") {
        recipe.menuPrice = null;
    } else {
        const price = parseFloat(answer);
        if (isNaN(price) || price < 0) {
            alert("That's not a valid price.");
            return;
        }
        recipe.menuPrice = price;
    }
    commit();
}

function deleteRecipe(recipeId) {
    const recipe = findById(db.recipes, recipeId);
    if (recipe === null) {
        return;
    }

    // Don't leave other recipes pointing at one that no longer exists
    const usedIn = linesUsingRecipe(recipeId);
    if (usedIn > 0) {
        alert("Can't delete " + recipe.name + ". " + usedIn + " other recipe(s) use it.");
        return;
    }

    if (!confirm("Delete " + recipe.name + "?")) {
        return;
    }
    db.recipes = db.recipes.filter(function (r) {
        return r.id !== recipeId;
    });
    // Remove its own lines too, so none are left pointing at nothing
    db.recipeLines = db.recipeLines.filter(function (line) {
        return line.recipeId !== recipeId;
    });
    commit();
}

// FIXME: Rename a recipe, change its yield, and store glass, garnish and
//        method (Phase 2 training)


// ===== Drawing =====

// The cost summary under a recipe's name
function makeCostSummary(recipe) {
    const batchCost = recipeCost(recipe.id);
    const parts = [];

    // Batch cost only matters when a recipe makes more than one serving
    if (!(recipe.yieldUnit === "serving" && recipe.yieldAmount === 1)) {
        parts.push("Batch " + formatMoney(batchCost)
            + " for " + formatAmount(recipe.yieldAmount) + " " + recipe.yieldUnit);
    }

    const perServing = costPerServing(recipe);
    if (perServing === null) {
        // Measured in volume/weight/count: show cost per yield unit
        parts.push(formatMoney(batchCost / recipe.yieldAmount) + "/" + recipe.yieldUnit);
    } else {
        parts.push("Cost " + formatMoney(perServing));
    }

    const summary = makeElement("span", "details", "");

    if (recipe.menuPrice !== null && recipe.menuPrice > 0 && perServing !== null) {
        const target = TARGET_COST[recipe.type];
        const costRatio = perServing / recipe.menuPrice;
        parts.push((costRatio * 100).toFixed(1) + "% cost");
        parts.push("Suggested " + formatMoney(perServing / target));
        if (costRatio > target + WARN_MARGIN) {
            summary.classList.add("warn");
        }
    } else if (recipe.menuPrice !== null && perServing === null) {
        parts.push("Menu price needs a yield in servings");
    }

    summary.textContent = parts.join(" · ");
    return summary;
}

// One line per ingredient: "1 fl oz Lime juice · $0.25" with a Remove button
function makeLineRow(line) {
    const row = makeElement("li", "line");

    let name;
    if (line.itemId !== null) {
        name = findById(db.items, line.itemId).name;
    } else {
        name = findById(db.recipes, line.subRecipeId).name + " (recipe)";
    }

    const text = formatAmount(line.amount) + " " + line.unit + " " + name
        + " · " + formatMoney(lineCost(line, new Set()));
    row.append(makeElement("span", "", text));
    row.append(makeButton("Remove", "secondary small", function () {
        removeLine(line.id);
    }));
    return row;
}

// Small form under each recipe: pick an item or recipe, amount, unit.
// The unit list changes to match whatever is picked.
function makeAddLineForm(recipe) {
    const form = makeElement("form", "add-line");

    // Source picker, with items and recipes in separate groups.
    // Values look like "item:<id>" or "recipe:<id>".
    const sourceSelect = document.createElement("select");

    const itemGroup = document.createElement("optgroup");
    itemGroup.label = "Items";
    for (const item of sortedItems()) {
        itemGroup.append(new Option(item.name, "item:" + item.id));
    }

    const recipeGroup = document.createElement("optgroup");
    recipeGroup.label = "Recipes";
    for (const other of sortedRecipes()) {
        // Skip itself, and anything that already uses it (would make a loop)
        if (usesRecipe(other.id, recipe.id)) {
            continue;
        }
        recipeGroup.append(new Option(other.name, "recipe:" + other.id));
    }

    if (itemGroup.children.length > 0) {
        sourceSelect.append(itemGroup);
    }
    if (recipeGroup.children.length > 0) {
        sourceSelect.append(recipeGroup);
    }
    if (sourceSelect.options.length === 0) {
        return makeElement("p", "details", "Add items first to build this recipe.");
    }

    const amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.step = "any";
    amountInput.min = "0";
    amountInput.placeholder = "Amt";
    amountInput.required = true;

    const unitSelect = document.createElement("select");

    // The unit family comes from the item's size unit or the recipe's yield
    function sourceUnit() {
        const [kind, id] = sourceSelect.value.split(":");
        if (kind === "item") {
            return findById(db.items, id).sizeUnit;
        }
        return findById(db.recipes, id).yieldUnit;
    }
    function refreshUnits() {
        const unit = sourceUnit();
        fillUnitSelect(unitSelect, unitsInFamily(familyOf(unit)), unit);
    }
    sourceSelect.addEventListener("change", refreshUnits);
    refreshUnits();

    const addButton = makeElement("button", "", "Add");
    addButton.type = "submit";

    form.append(sourceSelect, amountInput, unitSelect, addButton);

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        const amount = parseFloat(amountInput.value);
        if (isNaN(amount) || amount <= 0) {
            return;
        }
        const [kind, id] = sourceSelect.value.split(":");
        if (kind === "item") {
            setLine(recipe.id, id, null, amount, unitSelect.value);
        } else {
            setLine(recipe.id, null, id, amount, unitSelect.value);
        }
    });

    return form;
}

function makeRecipeItem(recipe) {
    const li = makeElement("li", "recipe");

    // Name, type tag and menu price
    const header = makeElement("div", "recipe-header");
    const title = makeElement("div");
    title.append(makeElement("strong", "", recipe.name), " ", makeElement("span", "tag", recipe.type));
    header.append(title);
    if (recipe.menuPrice !== null) {
        header.append(makeElement("span", "", formatMoney(recipe.menuPrice)));
    }
    li.append(header);

    // Costs. A loop should be impossible (the form blocks it), but if bad
    // data ever got in, show a message instead of crashing the page.
    try {
        li.append(makeCostSummary(recipe));
    } catch (error) {
        li.append(makeElement("span", "details warn", "Can't cost: this recipe uses itself."));
        return li;
    }

    const lineList = makeElement("ul", "line-list");
    for (const line of linesFor(recipe.id)) {
        lineList.append(makeLineRow(line));
    }
    li.append(lineList);

    li.append(makeAddLineForm(recipe));

    const buttons = makeElement("div", "buttons");
    buttons.append(
        makeButton("Menu price", "secondary", function () { changeMenuPrice(recipe.id); }),
        makeButton("Delete", "danger", function () { deleteRecipe(recipe.id); })
    );
    li.append(buttons);

    return li;
}

function sortedRecipes() {
    return db.recipes.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });
}

export function renderRecipes() {
    const list = resetList("recipe-list", "recipe-empty", db.recipes.length);
    for (const recipe of sortedRecipes()) {
        list.append(makeRecipeItem(recipe));
    }
}


// ===== Setup (runs once on page load) =====

export function initRecipes() {
    const typeSelect = document.getElementById("recipe-type");
    for (const type of RECIPE_TYPES) {
        typeSelect.append(new Option(type, type));
    }
    fillUnitSelect(document.getElementById("recipe-yield-unit"), YIELD_UNITS, "serving");

    document.getElementById("recipe-form").addEventListener("submit", function (event) {
        event.preventDefault(); // stop the page from reloading

        const priceText = readField("recipe-price");
        const fields = {
            name: readField("recipe-name"),
            type: readField("recipe-type"),
            yieldAmount: parseFloat(readField("recipe-yield-amount")),
            yieldUnit: readField("recipe-yield-unit"),
            menuPrice: priceText === "" ? null : parseFloat(priceText)
        };

        if (fields.name === "" || isNaN(fields.yieldAmount) || fields.yieldAmount <= 0) {
            return;
        }

        addRecipe(fields);
        writeFieldsBack();
    });

    // Reset the form but keep sensible defaults
    function writeFieldsBack() {
        document.getElementById("recipe-form").reset();
        fillUnitSelect(document.getElementById("recipe-yield-unit"), YIELD_UNITS, "serving");
    }
}
