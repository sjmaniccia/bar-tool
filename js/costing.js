// ===== costing.js =====
// All the cost math in one place. The Products, Ingredients and Recipes
// screens all use these functions, and this file draws nothing on screen.
//
// A SOURCE is somewhere an ingredient can come from:
//     { kind: "unit", unit }       buy it: a purchase unit ("case of 6 Lime juice 1 L" from RNDC)
//     { kind: "recipe", recipe }   make it ("Fresh lime juice" from limes, in-house)
//
// Which source a recipe line uses:
//     the line's own choice, ELSE the ingredient's house choice, ELSE the cheapest (an estimate)

import { db } from "./storage.js";
import { currentPrice } from "./prices.js";
import { convert } from "./units.js";
import { findById, formatAmount } from "./utils.js";


// ===== Conversions =====

// Every conversion saved for one ingredient (e.g. Lemon: 1 each = 0.25 lb)
export function conversionsFor(ingredientId) {
    const result = [];
    for (const conversion of db.ingredientConversions) {
        if (conversion.ingredientId === ingredientId) {
            result.push(conversion);
        }
    }
    return result;
}

// Convert an amount for one ingredient
//     IF the units are the same kind (both volume, both weight...), convert normally
//     ELSE try each of the ingredient's own conversions, in either direction
//     Returns null if nothing connects them
// e.g. 2 each of Lemon -> lb, using "1 each = 0.25 lb":
//     2 each = 2 × (0.25 ÷ 1) lb = 0.5 lb
export function convertFor(ingredientId, amount, fromUnit, toUnit) {
    const direct = convert(amount, fromUnit, toUnit);
    if (direct !== null) {
        return direct;
    }

    for (const c of conversionsFor(ingredientId)) {
        // Forward: from -> c.fromUnit, across to c.toUnit, then -> to
        const forward = convert(amount, fromUnit, c.fromUnit);
        if (forward !== null) {
            const result = convert(forward * c.toAmount / c.fromAmount, c.toUnit, toUnit);
            if (result !== null) {
                return result;
            }
        }
        // Backward: from -> c.toUnit, across to c.fromUnit, then -> to
        const backward = convert(amount, fromUnit, c.toUnit);
        if (backward !== null) {
            const result = convert(backward * c.fromAmount / c.toAmount, c.fromUnit, toUnit);
            if (result !== null) {
                return result;
            }
        }
    }
    return null;
}


// ===== Sources =====

// The format and product above a purchase unit
export function formatOf(unit) {
    return findById(db.formats, unit.formatId);
}
export function productOf(unit) {
    return findById(db.products, formatOf(unit).productId);
}

// Everything an ingredient can come from: purchase units you buy and recipes that make it
//     FOR EACH product for this ingredient
//         FOR EACH of its formats
//             FOR EACH way to buy that format -> one source
export function sourcesFor(ingredientId) {
    const sources = [];
    for (const product of db.products) {
        if (product.ingredientId !== ingredientId) {
            continue;
        }
        for (const format of db.formats) {
            if (format.productId !== product.id) {
                continue;
            }
            for (const unit of db.purchaseUnits) {
                if (unit.formatId === format.id) {
                    sources.push({ kind: "unit", unit: unit });
                }
            }
        }
    }
    for (const recipe of db.recipes) {
        if (recipe.producesIngredientId === ingredientId) {
            sources.push({ kind: "recipe", recipe: recipe });
        }
    }
    return sources;
}

// The id of a source, used for house and line choices
export function sourceId(source) {
    return source.kind === "unit" ? source.unit.id : source.recipe.id;
}

// A short name for a source: "Tito's · 1.75 L bottle · case of 6 · RNDC"
// or "Fresh lime juice (made in-house)"
export function sourceName(source) {
    if (source.kind === "recipe") {
        return source.recipe.name + " (made in-house)";
    }
    return productOf(source.unit).name + " · " + formatName(formatOf(source.unit))
        + " · " + purchaseUnitName(source.unit);
}

// "1.75 L bottle", "40 lb case", "12 fl oz can"
export function formatName(format) {
    return formatAmount(format.unitSize) + " " + format.sizeUnit
        + (format.packaging === "" ? "" : " " + format.packaging);
}

// "case of 6 · RNDC", "single · Southern Glazer's"
export function purchaseUnitName(unit) {
    const vendor = findById(db.vendors, unit.vendorId);
    const amount = unit.unitAmount === 1 ? unit.name : unit.name + " of " + unit.unitAmount;
    return amount + (vendor === null ? "" : " · " + vendor.companyName);
}

// The unit a source is measured in (a format's size unit, or a recipe's yield unit)
export function sourceUnit(source) {
    return source.kind === "unit" ? formatOf(source.unit).sizeUnit : source.recipe.yieldUnit;
}

// What one purchase unit costs per format container: a $204 case of 6 = $34 per bottle
export function pricePerContainer(unit) {
    return unit.unitAmount <= 0 ? 0 : currentPrice(unit.id) / unit.unitAmount;
}

// What one `unit` of an ingredient costs from this source, or null if it can't be worked out
//     PURCHASE UNIT: price ÷ usable amount (unit amount × unit size × yield %), converted to `unit`
//         e.g. $204 case of 6 × 1.75 L = $204 ÷ 10,500 ml
//     RECIPE: batch cost ÷ what the batch makes, converted to `unit`
export function sourceCostPerUnit(source, unit, ingredientId, inProgress = new Set()) {
    if (source.kind === "unit") {
        const format = formatOf(source.unit);
        const usable = source.unit.unitAmount * format.unitSize * (format.yieldPercent / 100);
        if (usable <= 0) {
            return null;
        }
        const sizeUnitsPerUnit = convertFor(ingredientId, 1, unit, format.sizeUnit);
        if (sizeUnitsPerUnit === null) {
            return null;
        }
        return currentPrice(source.unit.id) / usable * sizeUnitsPerUnit;
    }

    const recipe = source.recipe;
    if (recipe.yieldAmount <= 0) {
        return null;
    }
    const yieldUnitsPerUnit = convertFor(ingredientId, 1, unit, recipe.yieldUnit);
    if (yieldUnitsPerUnit === null) {
        return null;
    }
    // Recursion: costing the ingredient means costing the recipe that makes it
    return recipeCost(recipe.id, inProgress) / recipe.yieldAmount * yieldUnitsPerUnit;
}

// Find a source by kind and id, or null
function findSource(kind, id) {
    if (kind === "unit") {
        const unit = findById(db.purchaseUnits, id);
        return unit === null ? null : { kind: "unit", unit: unit };
    }
    const recipe = findById(db.recipes, id);
    return recipe === null ? null : { kind: "recipe", recipe: recipe };
}

// The house source for an ingredient, or null
export function houseSource(ingredient) {
    if (ingredient.housePurchaseUnitId !== null) {
        return findSource("unit", ingredient.housePurchaseUnitId);
    }
    if (ingredient.houseRecipeId !== null) {
        return findSource("recipe", ingredient.houseRecipeId);
    }
    return null;
}

// The cheapest source that can be priced in `unit`, or null
function cheapestSource(ingredientId, unit, inProgress) {
    let best = null;
    let bestCost = null;
    for (const source of sourcesFor(ingredientId)) {
        const cost = sourceCostPerUnit(source, unit, ingredientId, inProgress);
        if (cost === null) {
            continue;
        }
        if (best === null || cost < bestCost) {
            best = source;
            bestCost = cost;
        }
    }
    return best;
}

// Which source a recipe line uses, and why
// Returns { source, reason } where reason is "chosen", "house" or "cheapest",
// or null if the ingredient has no sources yet
export function sourceForLine(line, inProgress = new Set()) {
    if (line.choicePurchaseUnitId !== null) {
        const chosen = findSource("unit", line.choicePurchaseUnitId);
        if (chosen !== null) {
            return { source: chosen, reason: "chosen" };
        }
    }
    if (line.choiceRecipeId !== null) {
        const chosen = findSource("recipe", line.choiceRecipeId);
        if (chosen !== null) {
            return { source: chosen, reason: "chosen" };
        }
    }

    const ingredient = findById(db.ingredients, line.ingredientId);
    if (ingredient === null) {
        return null;
    }
    const house = houseSource(ingredient);
    if (house !== null) {
        return { source: house, reason: "house" };
    }

    const cheapest = cheapestSource(ingredient.id, line.unit, inProgress);
    if (cheapest !== null) {
        return { source: cheapest, reason: "cheapest" };
    }
    return null;
}


// ===== Recipes =====

// Every line that belongs to a recipe
export function linesFor(recipeId) {
    const result = [];
    for (const line of db.recipeLines) {
        if (line.recipeId === recipeId) {
            result.push(line);
        }
    }
    return result;
}

// Cost of one line, or null if it can't be priced yet
//     INGREDIENT line: its source's cost per unit × amount
//     SUB-RECIPE line: sub-recipe batch cost ÷ what it makes × amount
export function lineCost(line, inProgress = new Set()) {
    if (line.ingredientId !== null) {
        const pick = sourceForLine(line, inProgress);
        if (pick === null) {
            return null;
        }
        const perUnit = sourceCostPerUnit(pick.source, line.unit, line.ingredientId, inProgress);
        return perUnit === null ? null : perUnit * line.amount;
    }

    const sub = findById(db.recipes, line.subRecipeId);
    if (sub === null) {
        return null;
    }
    const perUnit = sourceCostPerUnit({ kind: "recipe", recipe: sub }, line.unit, null, inProgress);
    return perUnit === null ? null : perUnit * line.amount;
}

// Total cost of one batch = add up every line that can be priced
//     IF this recipe is already being costed further up, it's a loop: stop
export function recipeCost(recipeId, inProgress = new Set()) {
    if (inProgress.has(recipeId)) {
        throw new Error("Recipe loop found");
    }
    inProgress.add(recipeId);

    let total = 0;
    for (const line of linesFor(recipeId)) {
        const cost = lineCost(line, inProgress);
        if (cost !== null) {
            total = total + cost;
        }
    }

    inProgress.delete(recipeId);
    return total;
}

// Names of ingredients that can't be priced yet, in this recipe or anything it uses
export function missingPrices(recipeId, visited = new Set()) {
    const missing = [];
    if (visited.has(recipeId)) {
        return missing;
    }
    visited.add(recipeId);

    for (const line of linesFor(recipeId)) {
        if (line.ingredientId !== null) {
            if (lineCost(line) === null) {
                missing.push(findById(db.ingredients, line.ingredientId).name);
                continue;
            }
            // IF it comes from an in-house recipe, check that recipe too
            const pick = sourceForLine(line);
            if (pick.source.kind === "recipe") {
                for (const name of missingPrices(pick.source.recipe.id, visited)) {
                    missing.push(name);
                }
            }
        } else {
            for (const name of missingPrices(line.subRecipeId, visited)) {
                missing.push(name);
            }
        }
    }
    return missing;
}


// ===== Loop checks =====
// A recipe must never end up using itself, directly or through other
// recipes or the in-house recipes behind its ingredients.

// Does recipeId use targetId anywhere down the chain?
//     follows sub-recipe lines, and ingredient lines whose ingredient is made in-house
export function usesRecipe(recipeId, targetId, visited = new Set()) {
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
        if (line.ingredientId !== null) {
            for (const source of sourcesFor(line.ingredientId)) {
                if (source.kind === "recipe" && usesRecipe(source.recipe.id, targetId, visited)) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Would adding this ingredient to this recipe make a loop?
// (true if any recipe that makes the ingredient uses this recipe)
export function ingredientMakesLoop(ingredientId, recipeId) {
    for (const source of sourcesFor(ingredientId)) {
        if (source.kind === "recipe" && usesRecipe(source.recipe.id, recipeId)) {
            return true;
        }
    }
    return false;
}

// Would letting this recipe make this ingredient create a loop?
// (true if the recipe already uses the ingredient anywhere down its chain)
export function recipeUsesIngredient(recipeId, ingredientId, visited = new Set()) {
    if (visited.has(recipeId)) {
        return false;
    }
    visited.add(recipeId);

    for (const line of linesFor(recipeId)) {
        if (line.ingredientId === ingredientId) {
            return true;
        }
        if (line.subRecipeId !== null && recipeUsesIngredient(line.subRecipeId, ingredientId, visited)) {
            return true;
        }
        if (line.ingredientId !== null) {
            for (const source of sourcesFor(line.ingredientId)) {
                if (source.kind === "recipe" && recipeUsesIngredient(source.recipe.id, ingredientId, visited)) {
                    return true;
                }
            }
        }
    }
    return false;
}
