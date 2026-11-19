// ===== recipes.js =====
// The Recipes screen: cocktails, dishes, beers, and prep recipes
// (syrups, juices, sauces).
//
// A recipe makes yieldAmount of yieldUnit per batch: "1 serving", "32 fl oz", "10 barrel"
// menuPrice is per serving, or null if it isn't sold
// A prep recipe can MAKE an ingredient ("Fresh lime juice" makes "Lime juice"),
// so that ingredient can be bought OR made in-house (see ingredients.js)
// Each line uses an INGREDIENT ("1/2 cup Lime juice") or another recipe.
// All cost math lives in costing.js. This file draws the screen.

import { db, commit } from "./storage.js";
import {
    linesFor, lineCost, recipeCost, missingPrices, sourceForLine, sourcesFor,
    sourceId, sourceName, sourceUnit, usesRecipe, ingredientMakesLoop, recipeUsesIngredient
} from "./costing.js";
import {
    sortedIngredients, getOrCreateIngredient, unitsForIngredient, defaultUnitFor
} from "./ingredients.js";
import {
    YIELD_UNITS, familyOf, unitsInFamily, fillUnitSelect
} from "./units.js";
import {
    makeId, findById, formatMoney, formatFraction, parseAmount, readField,
    makeElement, makeButton, resetList
} from "./utils.js";


// Type choices
export const RECIPE_TYPES = ["Cocktail", "Dish", "Beer", "Prep"];

// Target cost % per type, used for the suggested price
// (typical: cocktails 18-24%, draft beer 20-25%, food 28-35%)
// FIXME: Let the user set their own targets.
const TARGET_COST = {
    Cocktail: 0.20,
    Beer: 0.25,
    Dish: 0.30,
    Prep: 0.30
};

// Show the cost in red if it's this far over target
const WARN_MARGIN = 0.05;


// ===== Data =====

// Cost per serving (batch cost ÷ servings), or null if not measured in servings
function costPerServing(recipe) {
    if (recipe.yieldUnit !== "serving" || recipe.yieldAmount <= 0) {
        return null;
    }
    return recipeCost(recipe.id) / recipe.yieldAmount;
}

// Count the lines in other recipes that use this recipe as a sub-recipe
function linesUsingRecipe(recipeId) {
    let count = 0;
    for (const line of db.recipeLines) {
        if (line.subRecipeId === recipeId) {
            count++;
        }
    }
    return count;
}

// Save a new recipe
function addRecipe(fields) {
    fields.id = makeId();
    db.recipes.push(fields);
    commit();
}

// Add a line
//     IF the recipe already uses this ingredient or sub-recipe, update that line
//     ELSE add a new one
function setLine(recipeId, ingredientId, subRecipeId, amount, unit) {
    for (const line of db.recipeLines) {
        if (line.recipeId === recipeId && line.ingredientId === ingredientId
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
        ingredientId: ingredientId,
        subRecipeId: subRecipeId,
        choicePurchaseUnitId: null,
        choiceRecipeId: null,
        amount: amount,
        unit: unit
    });
    commit();
}

// Set which source one line uses: "unit:<id>", "recipe:<id>", or "" for house/cheapest
function setLineChoice(lineId, value) {
    const line = findById(db.recipeLines, lineId);
    if (line === null) {
        return;
    }
    const [kind, id] = value.split(":");
    line.choicePurchaseUnitId = kind === "unit" ? id : null;
    line.choiceRecipeId = kind === "recipe" ? id : null;
    commit();
}

// Remove one line
function removeLine(lineId) {
    db.recipeLines = db.recipeLines.filter(function (line) {
        return line.id !== lineId;
    });
    commit();
}

// Ask for a new menu price (blank = not sold)
// FIXME: prompt() is quick but ugly. Replace with an inline form later.
function changeMenuPrice(recipeId) {
    const recipe = findById(db.recipes, recipeId);
    if (recipe === null) {
        return;
    }

    const current = recipe.menuPrice === null ? "" : recipe.menuPrice.toFixed(2);
    const answer = prompt("Menu price per serving for " + recipe.name + " (blank for none):", current);
    if (answer === null) {
        return;   // they clicked Cancel
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

// Ask which ingredient this recipe makes (blank = none)
//     IF the recipe already uses that ingredient, refuse (it would make itself)
// FIXME: prompt() is quick but ugly. Replace with an inline form later.
function changeMakes(recipeId) {
    const recipe = findById(db.recipes, recipeId);
    if (recipe === null) {
        return;
    }
    const current = findById(db.ingredients, recipe.producesIngredientId);
    const answer = prompt("Ingredient " + recipe.name + " makes (e.g. Lime juice, blank for none):",
        current === null ? "" : current.name);
    if (answer === null) {
        return;
    }

    if (answer.trim() === "") {
        recipe.producesIngredientId = null;
        clearRecipeChoices(recipe.id);
        commit();
        return;
    }

    const ingredient = getOrCreateIngredient(answer);
    if (recipeUsesIngredient(recipe.id, ingredient.id)) {
        alert(recipe.name + " already uses " + ingredient.name + ", so it can't also make it.");
        return;
    }
    recipe.producesIngredientId = ingredient.id;
    commit();
}

// Clear any house choice or line choice pointing at this recipe as a source
function clearRecipeChoices(recipeId) {
    for (const ingredient of db.ingredients) {
        if (ingredient.houseRecipeId === recipeId) {
            ingredient.houseRecipeId = null;
        }
    }
    for (const line of db.recipeLines) {
        if (line.choiceRecipeId === recipeId) {
            line.choiceRecipeId = null;
        }
    }
}

// Delete a recipe
//     IF another recipe uses it as a sub-recipe, refuse
//     ELSE ask to confirm, then delete it, its lines, and any choices pointing at it
function deleteRecipe(recipeId) {
    const recipe = findById(db.recipes, recipeId);
    if (recipe === null) {
        return;
    }

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
    db.recipeLines = db.recipeLines.filter(function (line) {
        return line.recipeId !== recipeId;
    });
    clearRecipeChoices(recipeId);
    commit();
}

// FIXME: Rename a recipe, change its yield, and store glass, garnish and
//        method (Phase 2 training)


// ===== Drawing =====

// Build the cost line under a recipe's name, e.g.
// "Cost $2.50 · 25.0% cost · Suggested $12.49"
//     IF some ingredients have no price yet, show the partial cost and what's missing
function makeCostSummary(recipe) {
    const batchCost = recipeCost(recipe.id);
    const parts = [];
    const missing = missingPrices(recipe.id);
    const summary = makeElement("span", "details", "");

    if (missing.length > 0) {
        summary.classList.add("warn");
        summary.textContent = "Cost so far " + formatMoney(batchCost)
            + " · No price yet for " + missing.join(", ");
        return summary;
    }

    // Show the batch cost unless the batch is just 1 serving
    if (!(recipe.yieldUnit === "serving" && recipe.yieldAmount === 1)) {
        parts.push("Batch " + formatMoney(batchCost)
            + " for " + formatFraction(recipe.yieldAmount) + " " + recipe.yieldUnit);
    }

    // Cost per serving, or per unit (fl oz, lb...) if not made in servings
    const perServing = costPerServing(recipe);
    if (perServing === null) {
        parts.push(formatMoney(batchCost / recipe.yieldAmount) + "/" + recipe.yieldUnit);
    } else {
        parts.push("Cost " + formatMoney(perServing));
    }

    // IF it has a menu price: show cost %, suggested price, and red if too high
    if (recipe.menuPrice !== null && recipe.menuPrice > 0 && perServing !== null) {
        const target = TARGET_COST[recipe.type];
        const costRatio = perServing / recipe.menuPrice;
        parts.push((costRatio * 100).toFixed(1) + "% cost");
        parts.push("Suggested " + formatMoney(perServing / target));   // price that hits the target
        if (costRatio > target + WARN_MARGIN) {
            summary.classList.add("warn");
        }
    } else if (recipe.menuPrice !== null && perServing === null) {
        parts.push("Menu price needs a yield in servings");
    }

    summary.textContent = parts.join(" · ");
    return summary;
}

// The dropdown on an ingredient line for choosing its source:
//     "House / cheapest" (the default), then every purchase unit and in-house recipe
// When a different one is picked, save it as this line's choice
function makeChoiceSelect(line) {
    const select = document.createElement("select");
    select.className = "choice";
    select.append(new Option("House / cheapest", ""));
    for (const source of sourcesFor(line.ingredientId)) {
        select.append(new Option(sourceName(source), source.kind + ":" + sourceId(source)));
    }
    if (line.choicePurchaseUnitId !== null) {
        select.value = "unit:" + line.choicePurchaseUnitId;
    } else if (line.choiceRecipeId !== null) {
        select.value = "recipe:" + line.choiceRecipeId;
    }

    select.addEventListener("change", function () {
        setLineChoice(line.id, select.value);
    });
    return select;
}

// Build one ingredient row, e.g.
//     "1/2 cup Lime juice · $1.00"
//     "Fresh lime juice (made in-house) (house)"   [source dropdown]
function makeLineRow(line) {
    const row = makeElement("li", "line");
    const info = makeElement("div");

    // Name of the ingredient or sub-recipe this line uses
    let name;
    if (line.ingredientId !== null) {
        name = findById(db.ingredients, line.ingredientId).name;
    } else {
        name = findById(db.recipes, line.subRecipeId).name + " (recipe)";
    }

    const cost = lineCost(line);
    let costText = cost === null ? "no price yet" : formatMoney(cost);

    // IF there are sources but none convert to this unit, say what's needed
    if (cost === null && line.ingredientId !== null) {
        const sources = sourcesFor(line.ingredientId);
        if (sources.length > 0) {
            costText = "needs a conversion from " + line.unit + " to " + sourceUnit(sources[0])
                + " (Ingredients tab)";
        }
    }
    info.append(makeElement("span", "", formatFraction(line.amount) + " " + line.unit + " " + name + " · " + costText));

    // For ingredient lines: which source is being used, and why
    if (line.ingredientId !== null) {
        const pick = sourceForLine(line);
        if (pick !== null && cost !== null) {
            const reasonText = {
                chosen: "chosen for this recipe",
                house: "house",
                cheapest: "cheapest, no house choice"
            }[pick.reason];
            info.append(makeElement("span", "details", sourceName(pick.source) + " (" + reasonText + ")"));
        }
        if (sourcesFor(line.ingredientId).length > 1) {
            info.append(makeChoiceSelect(line));   // only worth showing with 2+ sources
        }
    }
    row.append(info);

    // When Remove is clicked, remove this line
    row.append(makeButton("Remove", "secondary small", function () {
        removeLine(line.id);
    }));
    return row;
}

// Build the add-ingredient form under a recipe:
//     [ ingredient or recipe ] [ amount ] [ unit ] [ Add ]
// Amounts can be fractions: 1/2, 1 1/2, ½
function makeAddLineForm(recipe) {
    const form = makeElement("form", "add-line");

    // Picker: ingredients and recipes in two groups, plus "+ New ingredient…"
    // Each choice's value is "ingredient:<id>", "recipe:<id>" or "new"
    const sourceSelect = document.createElement("select");

    const ingredientGroup = document.createElement("optgroup");
    ingredientGroup.label = "Ingredients";
    for (const ingredient of sortedIngredients()) {
        if (ingredientMakesLoop(ingredient.id, recipe.id)) {
            continue;   // e.g. Fresh lime juice can't use Lime juice, since it makes it
        }
        ingredientGroup.append(new Option(ingredient.name, "ingredient:" + ingredient.id));
    }

    const recipeGroup = document.createElement("optgroup");
    recipeGroup.label = "Recipes";
    for (const other of sortedRecipes()) {
        if (usesRecipe(other.id, recipe.id)) {
            continue;   // skip itself and anything that would make a loop
        }
        recipeGroup.append(new Option(other.name, "recipe:" + other.id));
    }

    sourceSelect.append(new Option("+ New ingredient…", "new"));
    if (ingredientGroup.children.length > 0) {
        sourceSelect.append(ingredientGroup);
    }
    if (recipeGroup.children.length > 0) {
        sourceSelect.append(recipeGroup);
    }
    // Start on the first real choice if there is one
    if (sourceSelect.options.length > 1) {
        sourceSelect.selectedIndex = 1;
    }

    // Text, not number, so fractions like "1 1/2" can be typed
    const amountInput = document.createElement("input");
    amountInput.type = "text";
    amountInput.placeholder = "1 1/2";
    amountInput.required = true;

    const unitSelect = document.createElement("select");

    // Fill the unit list to match the picked ingredient or recipe
    function refreshUnits() {
        const [kind, id] = sourceSelect.value.split(":");   // "ingredient:123" -> "ingredient", "123"
        if (kind === "recipe") {
            const sub = findById(db.recipes, id);
            fillUnitSelect(unitSelect, unitsInFamily(familyOf(sub.yieldUnit)), sub.yieldUnit);
        } else if (kind === "ingredient") {
            fillUnitSelect(unitSelect, unitsForIngredient(), defaultUnitFor(id));
        } else {
            fillUnitSelect(unitSelect, unitsForIngredient(), "fl oz");
        }
    }

    // When "+ New ingredient…" is picked, ask for its name and add it to the list
    sourceSelect.addEventListener("change", function () {
        if (sourceSelect.value === "new") {
            const name = prompt("New ingredient name (e.g. Lemon):");
            if (name !== null && name.trim() !== "") {
                const ingredient = getOrCreateIngredient(name);   // saved with the line
                const value = "ingredient:" + ingredient.id;
                if (![...sourceSelect.options].some(function (o) { return o.value === value; })) {
                    ingredientGroup.append(new Option(ingredient.name, value));
                    if (!ingredientGroup.parentNode) {
                        sourceSelect.append(ingredientGroup);
                    }
                }
                sourceSelect.value = value;
            }
        }
        refreshUnits();
    });
    refreshUnits();

    const addButton = makeElement("button", "", "Add");
    addButton.type = "submit";

    form.append(sourceSelect, amountInput, unitSelect, addButton);

    // When Add is clicked, save the line
    //     IF the amount isn't a number (or fraction), say so
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        const amount = parseAmount(amountInput.value);
        if (isNaN(amount) || amount <= 0) {
            alert("Enter an amount like 2, 0.5, 1/2 or 1 1/2.");
            return;
        }
        if (sourceSelect.value === "new") {
            return;
        }
        const [kind, id] = sourceSelect.value.split(":");
        if (kind === "ingredient") {
            setLine(recipe.id, id, null, amount, unitSelect.value);
        } else {
            setLine(recipe.id, null, id, amount, unitSelect.value);
        }
    });

    return form;
}

// Build one recipe's block: header, costs, lines, add form, buttons
function makeRecipeItem(recipe) {
    const li = makeElement("li", "recipe");

    // Name, type, what it makes, and menu price
    const header = makeElement("div", "recipe-header");
    const title = makeElement("div");
    title.append(makeElement("strong", "", recipe.name), " ", makeElement("span", "tag", recipe.type));
    const makes = findById(db.ingredients, recipe.producesIngredientId);
    if (makes !== null) {
        title.append(" ", makeElement("span", "tag house", "makes " + makes.name));
    }
    header.append(title);
    if (recipe.menuPrice !== null) {
        header.append(makeElement("span", "", formatMoney(recipe.menuPrice)));
    }
    li.append(header);

    // Costs
    //     IF there's somehow a loop, show a message instead of crashing
    try {
        li.append(makeCostSummary(recipe));
    } catch (error) {
        li.append(makeElement("span", "details warn", "Can't cost: this recipe uses itself."));
        return li;
    }

    // Ingredient lines
    const lineList = makeElement("ul", "line-list");
    for (const line of linesFor(recipe.id)) {
        lineList.append(makeLineRow(line));
    }
    li.append(lineList);

    li.append(makeAddLineForm(recipe));

    // When a button is clicked: change menu price, change what it makes, or delete
    const buttons = makeElement("div", "buttons");
    buttons.append(
        makeButton("Menu price", "secondary", function () { changeMenuPrice(recipe.id); }),
        makeButton("Makes…", "secondary", function () { changeMakes(recipe.id); }),
        makeButton("Delete", "danger", function () { deleteRecipe(recipe.id); })
    );
    li.append(buttons);

    return li;
}

// All recipes, A-Z by name
function sortedRecipes() {
    return db.recipes.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });
}

// Redraw the Recipes screen
export function renderRecipes() {
    const list = resetList("recipe-list", "recipe-empty", db.recipes.length);
    for (const recipe of sortedRecipes()) {
        list.append(makeRecipeItem(recipe));
    }
}


// ===== Setup (runs once on page load) =====

export function initRecipes() {
    // Fill the type and yield unit dropdowns
    const typeSelect = document.getElementById("recipe-type");
    for (const type of RECIPE_TYPES) {
        typeSelect.append(new Option(type, type));
    }
    fillUnitSelect(document.getElementById("recipe-yield-unit"), YIELD_UNITS, "serving");

    // When the form is submitted, save the recipe
    document.getElementById("recipe-form").addEventListener("submit", function (event) {
        event.preventDefault();   // stop the page from reloading

        const priceText = readField("recipe-price");
        const makesName = readField("recipe-makes");
        const fields = {
            name: readField("recipe-name"),
            type: readField("recipe-type"),
            yieldAmount: parseAmount(readField("recipe-yield-amount")),   // fractions allowed
            yieldUnit: readField("recipe-yield-unit"),
            menuPrice: priceText === "" ? null : parseFloat(priceText),   // blank = not sold
            producesIngredientId: makesName === "" ? null : getOrCreateIngredient(makesName).id
        };

        if (fields.name === "" || isNaN(fields.yieldAmount) || fields.yieldAmount <= 0) {
            alert("Enter a name and how much it makes, like 1 or 1 1/2.");
            return;
        }

        addRecipe(fields);
        writeFieldsBack();
    });

    // Clear the form and set the yield unit back to "serving"
    function writeFieldsBack() {
        document.getElementById("recipe-form").reset();
        fillUnitSelect(document.getElementById("recipe-yield-unit"), YIELD_UNITS, "serving");
    }
}
