// ===== usage.ts =====
// Turns drinks into bottles: "214 Daiquiris" -> how many bottles of rum, limes, sugar...
// This is the THEORETICAL usage: what should have been used if every pour was perfect.
//
// For each line of the recipe, follow the same source the costing uses
// (the line's choice -> the house choice -> the cheapest):
//     a product you buy   -> amount ÷ (bottle size × usable %) = bottles used
//     a prep you make     -> share of the prep's batch, then do the same for ITS lines
//     a sub-recipe        -> same as a prep
// A recipe inside itself would loop forever, so it's tracked and skipped.

import { db } from "./storage";
import { convertFor, formatOf, linesFor, sourceForLine } from "./costing";
import { convert } from "./units";
import { findById } from "./utils";
import type { Recipe } from "./types";

export interface UsageResult {
    units: Map<string, number>;    // formatId -> units used (bottles, bags...)
    problems: Set<string>;         // ingredient or recipe names that couldn't be traced
}

export function emptyUsage(): UsageResult {
    return { units: new Map(), problems: new Set() };
}

// How many batches `servings` sold is
//     A drink usually makes 1 serving per batch, so 214 sold = 214 batches.
//     A recipe that makes 4 servings: 214 sold = 53.5 batches.
export function batchesFor(recipe: Recipe, servings: number): number {
    if (recipe.yieldUnit === "serving" && recipe.yieldAmount > 0) return servings / recipe.yieldAmount;
    return servings;   // FIXME: items sold by volume (a pitcher in fl oz) count as 1 batch each
}

// Add what `batches` batches of a recipe use into `into`
export function addRecipeUsage(recipeId: string, batches: number, into: UsageResult, inProgress = new Set<string>()) {
    const recipe = findById(db.recipes, recipeId);
    if (recipe === null || batches === 0) return;
    if (inProgress.has(recipeId)) {
        into.problems.add(recipe.name + " (uses itself)");
        return;
    }
    inProgress.add(recipeId);

    for (const line of linesFor(recipeId)) {
        const amount = line.amount * batches;

        // A sub-recipe on the line: use its share of a batch
        if (line.subRecipeId !== null) {
            const sub = findById(db.recipes, line.subRecipeId);
            if (sub === null) continue;
            const share = shareOfBatch(null, amount, line.unit, sub);
            if (share === null) into.problems.add(sub.name);
            else addRecipeUsage(sub.id, share, into, inProgress);
            continue;
        }

        const ingredient = findById(db.ingredients, line.ingredientId);
        const picked = sourceForLine(line, inProgress);
        if (picked === null) {
            into.problems.add(ingredient?.name ?? "?");
            continue;
        }

        if (picked.source.kind === "unit") {
            // A product you buy: convert to the bottle's unit, divide by what's usable in a bottle
            const format = formatOf(picked.source.unit);
            if (format === null) continue;
            const inBottleUnit = convertFor(line.ingredientId, amount, line.unit, format.sizeUnit);
            const usable = format.unitSize * (format.yieldPercent / 100);
            if (inBottleUnit === null || usable <= 0) {
                into.problems.add(ingredient?.name ?? "?");
                continue;
            }
            into.units.set(format.id, (into.units.get(format.id) ?? 0) + inBottleUnit / usable);
        } else {
            // A prep you make: its share of a batch, then its own lines
            const share = shareOfBatch(line.ingredientId, amount, line.unit, picked.source.recipe);
            if (share === null) into.problems.add(ingredient?.name ?? "?");
            else addRecipeUsage(picked.source.recipe.id, share, into, inProgress);
        }
    }
    inProgress.delete(recipeId);
}

// What fraction of a recipe's batch an amount is (1 fl oz of a 32 fl oz batch = 1/32), or null
function shareOfBatch(ingredientId: string | null, amount: number, unit: string, recipe: Recipe): number | null {
    if (recipe.yieldAmount <= 0) return null;
    const inYieldUnit = convertFor(ingredientId, amount, unit, recipe.yieldUnit) ?? convert(amount, unit, recipe.yieldUnit);
    return inYieldUnit === null ? null : inYieldUnit / recipe.yieldAmount;
}
