// ===== actions.ts =====
// Every change the recipe screens can make. Each one changes db, then commit()
// saves and redraws. Screens call these instead of touching db directly.

import { db, commit } from "./storage";
import { findById, makeId } from "./utils";
import type { Ingredient, Recipe, RecipeLine } from "./types";


// ===== Ingredients =====

// Find an ingredient by name, ignoring capitals and extra spaces, or null
export function findIngredientByName(name: string): Ingredient | null {
    const wanted = name.trim().toLowerCase();
    return db.ingredients.find((i) => i.name.toLowerCase() === wanted) ?? null;
}

// Find an ingredient by name, or create it (saved with the next commit)
export function getOrCreateIngredient(name: string): Ingredient {
    const existing = findIngredientByName(name);
    if (existing !== null) return existing;
    const ingredient: Ingredient = { id: makeId(), name: name.trim(), housePurchaseUnitId: null, houseRecipeId: null };
    db.ingredients.push(ingredient);
    return ingredient;
}


// ===== Recipes =====

// Create a new recipe with sensible defaults, and return its id
export function createRecipe(name: string): string {
    const recipe: Recipe = {
        id: makeId(),
        name: name.trim() || "New recipe",
        type: "Cocktail",
        yieldAmount: 1,
        yieldUnit: "serving",
        menuPrice: null,
        producesIngredientId: null,
        laborWage: null,
        laborMinutes: null,
        glass: "",
        garnish: "",
        description: "",
        directions: "",
        photo: ""
    };
    db.recipes.push(recipe);
    commit();
    return recipe.id;
}

// Change some fields of a recipe.
// Partial<Recipe> means "an object with any of Recipe's fields": { menuPrice: 12 }
export function updateRecipe(recipeId: string, changes: Partial<Recipe>) {
    const recipe = findById(db.recipes, recipeId);
    if (recipe === null) return;
    Object.assign(recipe, changes);
    commit();
}

// Copy a recipe and all its lines, and return the copy's id
export function duplicateRecipe(recipeId: string): string | null {
    const recipe = findById(db.recipes, recipeId);
    if (recipe === null) return null;
    const copy: Recipe = { ...recipe, id: makeId(), name: recipe.name + " (copy)", producesIngredientId: null };
    db.recipes.push(copy);
    for (const line of db.recipeLines.filter((l) => l.recipeId === recipeId)) {
        db.recipeLines.push({ ...line, id: makeId(), recipeId: copy.id });
    }
    commit();
    return copy.id;
}

// How many lines in other recipes use this one as a sub-recipe
export function linesUsingRecipe(recipeId: string): number {
    return db.recipeLines.filter((line) => line.subRecipeId === recipeId).length;
}

// Delete a recipe, its lines, and any choices pointing at it
//     Returns false (and deletes nothing) if another recipe uses it
export function deleteRecipe(recipeId: string): boolean {
    if (linesUsingRecipe(recipeId) > 0) return false;
    db.recipes = db.recipes.filter((r) => r.id !== recipeId);
    db.recipeLines = db.recipeLines.filter((line) => line.recipeId !== recipeId);
    for (const ingredient of db.ingredients) {
        if (ingredient.houseRecipeId === recipeId) ingredient.houseRecipeId = null;
    }
    for (const line of db.recipeLines) {
        if (line.choiceRecipeId === recipeId) line.choiceRecipeId = null;
    }
    commit();
    return true;
}


// ===== Recipe lines =====

// Add a line
//     IF the recipe already uses this ingredient or sub-recipe, update that line
//     ELSE add a new one
export function addLine(recipeId: string, ingredientId: string | null, subRecipeId: string | null, amount: number, unit: string) {
    const existing = db.recipeLines.find((line) =>
        line.recipeId === recipeId && line.ingredientId === ingredientId && line.subRecipeId === subRecipeId);
    if (existing !== undefined) {
        existing.amount = amount;
        existing.unit = unit;
    } else {
        db.recipeLines.push({
            id: makeId(), recipeId, ingredientId, subRecipeId,
            choicePurchaseUnitId: null, choiceRecipeId: null, amount, unit
        });
    }
    commit();
}

// Change some fields of one line (amount, unit...)
export function updateLine(lineId: string, changes: Partial<RecipeLine>) {
    const line = findById(db.recipeLines, lineId);
    if (line === null) return;
    Object.assign(line, changes);
    commit();
}

// Set which source a line uses: "unit:<id>", "recipe:<id>", or "" for house/cheapest
export function setLineChoice(lineId: string, key: string) {
    const [kind, id] = key.split(":");
    updateLine(lineId, {
        choicePurchaseUnitId: kind === "unit" ? id : null,
        choiceRecipeId: kind === "recipe" ? id : null
    });
}

export function removeLine(lineId: string) {
    db.recipeLines = db.recipeLines.filter((line) => line.id !== lineId);
    commit();
}
