// ===== costing.ts =====
// All the cost math in one place. Screens use these functions; nothing here draws.
//
// A SOURCE is somewhere an ingredient can come from:
//     { kind: "unit", unit }       buy it: a purchase unit ("case of 6 Tito's 1.75 L from RNDC")
//     { kind: "recipe", recipe }   make it: an in-house recipe ("Fresh lime juice")
//
// Which source a recipe line uses:
//     the line's own choice, ELSE the ingredient's house choice, ELSE the cheapest (an estimate)

import { db } from "./storage";
import { currentPrice } from "./prices";
import { convert } from "./units";
import { findById, formatAmount } from "./utils";
import type { Format, Ingredient, Product, PurchaseUnit, Recipe, RecipeLine } from "./types";

// A source is one of two shapes; `kind` tells you which
export type Source =
    | { kind: "unit"; unit: PurchaseUnit }
    | { kind: "recipe"; recipe: Recipe };

export type PickReason = "chosen" | "house" | "cheapest";


// ===== Conversions =====

// Convert an amount for one ingredient
//     IF the units are the same kind, convert normally
//     ELSE try each of the ingredient's own conversions, in either direction
// e.g. 2 each of Lemon -> lb, using "1 each = 0.25 lb": 2 × 0.25 = 0.5 lb
export function convertFor(ingredientId: string | null, amount: number, fromUnit: string, toUnit: string): number | null {
    const direct = convert(amount, fromUnit, toUnit);
    if (direct !== null) {
        return direct;
    }
    for (const c of db.ingredientConversions) {
        if (c.ingredientId !== ingredientId) {
            continue;
        }
        const forward = convert(amount, fromUnit, c.fromUnit);
        if (forward !== null) {
            const result = convert(forward * c.toAmount / c.fromAmount, c.toUnit, toUnit);
            if (result !== null) return result;
        }
        const backward = convert(amount, fromUnit, c.toUnit);
        if (backward !== null) {
            const result = convert(backward * c.fromAmount / c.toAmount, c.fromUnit, toUnit);
            if (result !== null) return result;
        }
    }
    return null;
}


// ===== Sources =====

export function formatOf(unit: PurchaseUnit): Format | null {
    return findById(db.formats, unit.formatId);
}
export function productOf(unit: PurchaseUnit): Product | null {
    const format = formatOf(unit);
    return format === null ? null : findById(db.products, format.productId);
}

// Everything an ingredient can come from: purchase units you buy and recipes that make it
export function sourcesFor(ingredientId: string): Source[] {
    const sources: Source[] = [];
    for (const product of db.products) {
        if (product.ingredientId !== ingredientId) continue;
        for (const format of db.formats) {
            if (format.productId !== product.id) continue;
            for (const unit of db.purchaseUnits) {
                if (unit.formatId === format.id) {
                    sources.push({ kind: "unit", unit });
                }
            }
        }
    }
    for (const recipe of db.recipes) {
        if (recipe.producesIngredientId === ingredientId) {
            sources.push({ kind: "recipe", recipe });
        }
    }
    return sources;
}

// A value that identifies a source in a dropdown: "unit:<id>" or "recipe:<id>"
export function sourceKey(source: Source): string {
    return source.kind === "unit" ? "unit:" + source.unit.id : "recipe:" + source.recipe.id;
}

// "1.75 L bottle"
export function formatName(format: Format): string {
    // "1 each each" reads badly: skip the packaging when it repeats the unit
    const packaging = format.packaging && format.packaging !== format.sizeUnit ? " " + format.packaging : "";
    return formatAmount(format.unitSize) + " " + format.sizeUnit + packaging;
}

// "Tito's · 1750 ml bottle · case of 6 · RNDC"  or  "Fresh lime juice (made in-house)"
export function sourceName(source: Source): string {
    if (source.kind === "recipe") {
        return source.recipe.name + " (made in-house)";
    }
    const unit = source.unit;
    const format = formatOf(unit);
    const vendor = findById(db.vendors, unit.vendorId);
    const buy = unit.unitAmount === 1 ? unit.name : unit.name + " of " + unit.unitAmount;
    return [productOf(unit)?.name ?? "?", format ? formatName(format) : "?", buy, vendor?.companyName]
        .filter(Boolean)
        .join(" · ");
}

// The unit a source is measured in
export function sourceUnit(source: Source): string {
    return source.kind === "unit" ? (formatOf(source.unit)?.sizeUnit ?? "") : source.recipe.yieldUnit;
}

// What one `unit` of an ingredient costs from this source, or null if it can't be worked out
//     PURCHASE UNIT: price ÷ (unit amount × size × yield %), converted to `unit`
//         e.g. $204 case of 6 × 1.75 L = $204 ÷ 10,500 ml
//     RECIPE: batch cost ÷ what the batch makes, converted to `unit`
export function sourceCostPerUnit(source: Source, unit: string, ingredientId: string | null, inProgress = new Set<string>()): number | null {
    if (source.kind === "unit") {
        const format = formatOf(source.unit);
        if (format === null) return null;
        const usable = source.unit.unitAmount * format.unitSize * (format.yieldPercent / 100);
        if (usable <= 0) return null;
        const sizeUnitsPerUnit = convertFor(ingredientId, 1, unit, format.sizeUnit);
        if (sizeUnitsPerUnit === null) return null;
        return currentPrice(source.unit.id) / usable * sizeUnitsPerUnit;
    }
    const recipe = source.recipe;
    if (recipe.yieldAmount <= 0) return null;
    const yieldUnitsPerUnit = convertFor(ingredientId, 1, unit, recipe.yieldUnit);
    if (yieldUnitsPerUnit === null) return null;
    // Recursion: costing the ingredient means costing the recipe that makes it
    return recipeIngredientCost(recipe.id, inProgress) / recipe.yieldAmount * yieldUnitsPerUnit;
}

function findSource(kind: "unit" | "recipe", id: string | null): Source | null {
    if (kind === "unit") {
        const unit = findById(db.purchaseUnits, id);
        return unit === null ? null : { kind: "unit", unit };
    }
    const recipe = findById(db.recipes, id);
    return recipe === null ? null : { kind: "recipe", recipe };
}

// The house source for an ingredient, or null
export function houseSource(ingredient: Ingredient): Source | null {
    return findSource("unit", ingredient.housePurchaseUnitId) ?? findSource("recipe", ingredient.houseRecipeId);
}

// The cheapest source that can be priced in `unit`, or null
function cheapestSource(ingredientId: string, unit: string, inProgress: Set<string>): Source | null {
    let best: Source | null = null;
    let bestCost = Infinity;
    for (const source of sourcesFor(ingredientId)) {
        const cost = sourceCostPerUnit(source, unit, ingredientId, inProgress);
        if (cost !== null && cost < bestCost) {
            best = source;
            bestCost = cost;
        }
    }
    return best;
}

// Which source a recipe line uses, and why (null if the ingredient has no sources yet)
export function sourceForLine(line: RecipeLine, inProgress = new Set<string>()): { source: Source; reason: PickReason } | null {
    const chosen = findSource("unit", line.choicePurchaseUnitId) ?? findSource("recipe", line.choiceRecipeId);
    if (chosen !== null) {
        return { source: chosen, reason: "chosen" };
    }
    const ingredient = findById(db.ingredients, line.ingredientId);
    if (ingredient === null) return null;
    const house = houseSource(ingredient);
    if (house !== null) {
        return { source: house, reason: "house" };
    }
    const cheapest = cheapestSource(ingredient.id, line.unit, inProgress);
    return cheapest === null ? null : { source: cheapest, reason: "cheapest" };
}


// ===== Recipe ingredient cost =====

export function linesFor(recipeId: string): RecipeLine[] {
    return db.recipeLines.filter((line) => line.recipeId === recipeId);
}

// The in-house recipe behind a line (a sub-recipe line, or an ingredient made in-house), or null
function recipeBehindLine(line: RecipeLine): Recipe | null {
    if (line.subRecipeId !== null) {
        return findById(db.recipes, line.subRecipeId);
    }
    const pick = sourceForLine(line);
    return pick !== null && pick.source.kind === "recipe" ? pick.source.recipe : null;
}

// How much of a recipe's batch one line uses (e.g. 1 fl oz of an 8 fl oz batch = 1/8), or null
function shareOfBatch(line: RecipeLine, recipe: Recipe): number | null {
    if (recipe.yieldAmount <= 0) return null;
    const amount = convertFor(line.ingredientId, line.amount, line.unit, recipe.yieldUnit);
    return amount === null ? null : amount / recipe.yieldAmount;
}

// Ingredient cost of one line, or null if it can't be priced yet
export function lineIngredientCost(line: RecipeLine, inProgress = new Set<string>()): number | null {
    if (line.ingredientId !== null) {
        const pick = sourceForLine(line, inProgress);
        if (pick === null) return null;
        const perUnit = sourceCostPerUnit(pick.source, line.unit, line.ingredientId, inProgress);
        return perUnit === null ? null : perUnit * line.amount;
    }
    const sub = findById(db.recipes, line.subRecipeId);
    if (sub === null) return null;
    const perUnit = sourceCostPerUnit({ kind: "recipe", recipe: sub }, line.unit, null, inProgress);
    return perUnit === null ? null : perUnit * line.amount;
}

// Ingredient cost of one whole batch = add up every line that can be priced
//     IF this recipe is already being costed further up, it's a loop: stop
export function recipeIngredientCost(recipeId: string, inProgress = new Set<string>()): number {
    if (inProgress.has(recipeId)) {
        throw new Error("Recipe loop found");
    }
    inProgress.add(recipeId);
    let total = 0;
    for (const line of linesFor(recipeId)) {
        total += lineIngredientCost(line, inProgress) ?? 0;
    }
    inProgress.delete(recipeId);
    return total;
}


// ===== Labor =====

// Labor of one line: its share of the in-house recipe behind it (0 for bought ingredients)
// e.g. 1 fl oz of an 8 fl oz lime juice batch that takes $1.60 of labor = $0.20
export function lineLaborCost(line: RecipeLine, inProgress = new Set<string>()): number {
    const behind = recipeBehindLine(line);
    if (behind === null) return 0;
    const share = shareOfBatch(line, behind);
    return share === null ? 0 : recipeLaborCost(behind.id, inProgress) * share;
}

// Labor of one whole batch = own labor (wage × minutes ÷ 60) + every line's labor share
export function recipeLaborCost(recipeId: string, inProgress = new Set<string>()): number {
    if (inProgress.has(recipeId)) {
        throw new Error("Recipe loop found");
    }
    const recipe = findById(db.recipes, recipeId);
    if (recipe === null) return 0;
    inProgress.add(recipeId);
    let total = recipe.laborWage !== null && recipe.laborMinutes !== null
        ? recipe.laborWage * recipe.laborMinutes / 60
        : 0;
    for (const line of linesFor(recipeId)) {
        total += lineLaborCost(line, inProgress);
    }
    inProgress.delete(recipeId);
    return total;
}


// ===== Everything a recipe page needs, in one object =====

// Target cost % per type, used for the suggested price
// (typical: cocktails 18-24%, draft beer 20-25%, food 28-35%)
// FIXME: Let the user set their own targets.
export const TARGET_COST: Record<Recipe["type"], number> = {
    Cocktail: 0.20,
    Beer: 0.25,
    Dish: 0.30,
    Prep: 0.30
};

export interface RecipeSummary {
    perServing: boolean;        // true if measured in servings
    divisor: number;            // what costs are divided by: servings, or the yield amount
    ingredientCost: number;     // per serving (or per yield unit)
    laborCost: number;
    totalCost: number;
    batchIngredientCost: number;
    batchLaborCost: number;
    menuPrice: number | null;
    profit: number | null;      // menu price - total cost
    ingredientRatio: number | null;
    laborRatio: number | null;
    totalRatio: number | null;
    suggestedPrice: number;     // ingredient cost ÷ target %
    targetCost: number;
    missing: string[];          // ingredients with no price yet
}

export function summarize(recipe: Recipe): RecipeSummary {
    const batchIngredientCost = recipeIngredientCost(recipe.id);
    const batchLaborCost = recipeLaborCost(recipe.id);
    const divisor = recipe.yieldAmount > 0 ? recipe.yieldAmount : 1;
    const ingredientCost = batchIngredientCost / divisor;
    const laborCost = batchLaborCost / divisor;
    const totalCost = ingredientCost + laborCost;
    const price = recipe.menuPrice !== null && recipe.menuPrice > 0 ? recipe.menuPrice : null;
    const targetCost = TARGET_COST[recipe.type];
    return {
        perServing: recipe.yieldUnit === "serving",
        divisor,
        ingredientCost,
        laborCost,
        totalCost,
        batchIngredientCost,
        batchLaborCost,
        menuPrice: price,
        profit: price === null ? null : price - totalCost,
        ingredientRatio: price === null ? null : ingredientCost / price,
        laborRatio: price === null ? null : laborCost / price,
        totalRatio: price === null ? null : totalCost / price,
        suggestedPrice: ingredientCost / targetCost,
        targetCost,
        missing: missingPrices(recipe.id)
    };
}

// Names of ingredients that can't be priced yet, here or in anything this recipe uses
export function missingPrices(recipeId: string, visited = new Set<string>()): string[] {
    const missing: string[] = [];
    if (visited.has(recipeId)) return missing;
    visited.add(recipeId);
    for (const line of linesFor(recipeId)) {
        if (line.ingredientId !== null && lineIngredientCost(line) === null) {
            missing.push(findById(db.ingredients, line.ingredientId)?.name ?? "?");
            continue;
        }
        const behind = recipeBehindLine(line);
        if (behind !== null) {
            missing.push(...missingPrices(behind.id, visited));
        }
    }
    return missing;
}


// ===== Loop checks =====
// A recipe must never end up using itself, directly or through in-house sources.

// Does recipeId use targetId anywhere down the chain?
export function usesRecipe(recipeId: string, targetId: string, visited = new Set<string>()): boolean {
    if (recipeId === targetId) return true;
    if (visited.has(recipeId)) return false;
    visited.add(recipeId);
    for (const line of linesFor(recipeId)) {
        if (line.subRecipeId !== null && usesRecipe(line.subRecipeId, targetId, visited)) return true;
        if (line.ingredientId !== null) {
            for (const source of sourcesFor(line.ingredientId)) {
                if (source.kind === "recipe" && usesRecipe(source.recipe.id, targetId, visited)) return true;
            }
        }
    }
    return false;
}

// Would adding this ingredient to this recipe make a loop?
export function ingredientMakesLoop(ingredientId: string, recipeId: string): boolean {
    return sourcesFor(ingredientId).some((source) => source.kind === "recipe" && usesRecipe(source.recipe.id, recipeId));
}

// Would letting this recipe make this ingredient create a loop?
export function recipeUsesIngredient(recipeId: string, ingredientId: string, visited = new Set<string>()): boolean {
    if (visited.has(recipeId)) return false;
    visited.add(recipeId);
    for (const line of linesFor(recipeId)) {
        if (line.ingredientId === ingredientId) return true;
        if (line.subRecipeId !== null && recipeUsesIngredient(line.subRecipeId, ingredientId, visited)) return true;
        if (line.ingredientId !== null) {
            for (const source of sourcesFor(line.ingredientId)) {
                if (source.kind === "recipe" && recipeUsesIngredient(source.recipe.id, ingredientId, visited)) return true;
            }
        }
    }
    return false;
}
