// ===== recipeScan.ts =====
// Turns the recipes Claude read off recipe book pages into Agave recipes.
//
//     FOR each recipe found:
//         IF a recipe with that name exists -> flag it (left out unless the manager ticks it)
//         FOR each ingredient line, find the bar's ingredient it is:
//             1. EXACT: an ingredient (or a product) with that name     -> "Lime juice"
//             2. SUGGESTED: the words mostly match                      -> "fresh lime juice" ~ "Lime juice"
//                                                                          "Tito's" ~ the product "Tito's Handmade Vodka" -> its ingredient
//             3. NEW: nothing close -> a new ingredient by that name, made when saved
//         (a "Just recipes" place skips step 2: a family recipe's "sage" stays "sage")
//         a count with no unit written ("2 onions") is marked to be checked
//     SAVE the ticked recipes (prep recipes first, so cocktails can use the syrups they make)
//
// New ingredients have no cost until they're linked to a product or prep recipe,
// so the recipe page shows them as "no cost yet": the same as adding a recipe by hand.

import { me } from "./me";
import { db, commit } from "./storage";
import { findIngredientByName, getOrCreateIngredient } from "./actions";
import { findById, makeId } from "./utils";
import type { Recipe } from "./types";
import type { ScannedIngredient, ScannedRecipe } from "../../supabase/functions/_shared/recipe-scan";

export type { ScannedIngredient, ScannedRecipe };

export type IngredientHow = "exact" | "suggested" | "new" | "picked";

export interface RecipeDraftLine {
    scanned: ScannedIngredient;
    amount: number | null;
    unit: string;
    countWord: string;             // "clove" in "3 cloves garlic"; "" = the thing itself
    note: string;                  // "chopped", "to taste"
    checkCount: boolean;           // "2 onions": no unit was written; the person confirms it's a count
    ingredientId: string | null;   // null = a new ingredient called newName
    newName: string;
    how: IngredientHow;
}

export interface RecipeDraft {
    key: string;                   // for the screen's lists
    page: number;                  // which photo it came from (1, 2, 3...)
    include: boolean;
    duplicateOf: string | null;    // an existing recipe with the same name
    name: string;
    type: ScannedRecipe["type"];
    glass: string;
    garnish: string;
    directions: string;
    description: string;
    menuPrice: number | null;
    yieldAmount: number;
    yieldUnit: string;
    hasPhoto: boolean;
    open: number | null;           // the line being edited (null = none): the screen's state, saved nowhere
    photo: string;                 // the picture cut out of the page (a web address or data), "" for none
    photoBlob?: Blob | null;       // the cut-out picture, until it's saved (then photo is its address)
    lines: RecipeDraftLine[];
}


// ===== Matching ingredients =====

const FILLER = new Set(["fresh", "freshly", "squeezed", "house", "housemade", "homemade", "made", "the", "of", "and", "premium", "chilled", "cold", "a", "oz", "ml"]);

// "Fresh-squeezed Lime Juice" -> ["lime", "juice"]
export function ingredientWords(text: string): string[] {
    return text.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter((w) => w !== "" && !FILLER.has(w));
}

// How alike two names are, 0 to 1
//     mostly: how much of the shorter name is in the longer one ("titos" is all in "titos handmade vodka")
//     a little: how close they are in length (so "lime" fits "lime juice" better than "lime cordial syrup")
export function nameScore(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const shared = a.filter((w) => b.includes(w)).length;
    return (shared / Math.min(a.length, b.length)) * (0.5 + 0.5 * shared / Math.max(a.length, b.length));
}

export function matchIngredient(name: string, closeMatches = true): { ingredientId: string | null; how: IngredientHow } {
    const exact = findIngredientByName(name);
    if (exact) return { ingredientId: exact.id, how: "exact" };
    const lower = name.trim().toLowerCase();
    const product = db.products.find((p) => p.name.toLowerCase() === lower && p.ingredientId);
    if (product) return { ingredientId: product.ingredientId, how: "exact" };
    if (!closeMatches) return { ingredientId: null, how: "new" };

    const mine = ingredientWords(name);
    let best: { id: string; score: number } | null = null;
    const consider = (id: string | null, other: string) => {
        if (!id) return;
        const score = nameScore(mine, ingredientWords(other));
        if (score >= 0.6 && (best === null || score > best.score)) best = { id, score };
    };
    for (const ingredient of db.ingredients) consider(ingredient.id, ingredient.name);
    for (const p of db.products) consider(p.ingredientId, p.name);
    const found = best as { id: string; score: number } | null;
    return found ? { ingredientId: found.id, how: "suggested" } : { ingredientId: null, how: "new" };
}

// "fresh lime juice" -> "Fresh lime juice" (a new ingredient's name)
function tidyName(name: string): string {
    const trimmed = name.trim().replace(/\s+/g, " ");
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}


// ===== Drafts =====

export function findRecipeByName(name: string): string | null {
    const lower = name.trim().toLowerCase();
    return db.recipes.find((r) => r.name.toLowerCase() === lower)?.id ?? null;
}

//     recipesOnly: no close matches, no drink fields, and every recipe is a Dish
//     "Serves 8" -> makes 8 servings (costing divides by it, so cost per serving comes out right)
export function buildRecipeDrafts(recipes: ScannedRecipe[], page: number, recipesOnly = false): RecipeDraft[] {
    return recipes.map((r) => {
        const duplicateOf = findRecipeByName(r.name);
        const serves = r.type !== "Prep" && r.serves ? r.serves : null;
        return {
            key: makeId(), page, include: duplicateOf === null, duplicateOf, open: null,
            name: r.name, type: recipesOnly ? "Dish" : r.type,
            glass: recipesOnly ? "" : r.glass, garnish: recipesOnly ? "" : r.garnish,
            directions: r.directions, description: r.description,
            menuPrice: recipesOnly ? null : r.menuPrice,
            yieldAmount: serves ?? r.yieldAmount, yieldUnit: serves ? "serving" : r.yieldUnit,
            hasPhoto: r.hasPhoto, photo: "",
            lines: r.ingredients.map((g) => ({
                scanned: g, amount: g.amount, unit: g.unit, countWord: g.countWord ?? "", note: g.note,
                checkCount: g.unitGuessed === true, newName: tidyName(g.name),
                ...matchIngredient(g.name, !recipesOnly)
            }))
        };
    });
}

// The name a line shows: its ingredient's, or the new one's
export function draftLineName(line: RecipeDraftLine): string {
    return line.ingredientId ? findById(db.ingredients, line.ingredientId)?.name ?? line.newName : line.newName;
}

// Names that mean the same ingredient share a key: "Fresh lemon juice" and "lemon juice"
export function ingredientKey(name: string): string {
    return ingredientWords(name).sort().join(" ") || name.trim().toLowerCase();
}

// The ingredients a batch of drafts would add, one per key (the shortest way it's written)
//     names a prep recipe in the batch makes don't count: saving the prep makes them
export function newIngredientNames(drafts: RecipeDraft[]): string[] {
    const chosen = drafts.filter((d) => d.include);
    const madeByPreps = new Set(chosen.filter((d) => d.type === "Prep").map((d) => ingredientKey(d.name)));
    const names = new Map<string, string>();
    for (const d of chosen) {
        for (const l of d.lines) {
            if (l.ingredientId !== null) continue;
            const key = ingredientKey(l.newName);
            if (madeByPreps.has(key)) continue;
            const current = names.get(key);
            if (current === undefined || l.newName.length < current.length) names.set(key, l.newName);
        }
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
}

// An existing ingredient with the same key, else make one called name
function ingredientFor(name: string): string {
    const key = ingredientKey(name);
    const same = db.ingredients.find((i) => ingredientKey(i.name) === key);
    return same ? same.id : getOrCreateIngredient(name).id;
}


// ===== Saving =====

// Save one draft as a recipe -> its id
//     IF the name is taken -> "<name> (scanned)"
//     lines with no amount ("top with soda") are kept at 0 with no unit, the word as their note
//     a prep recipe makes the ingredient with its name (so cocktails using it get its cost)
//     each line keeps its count word and note ("3 cloves garlic, minced", "salt to taste")
export function saveRecipeDraft(draft: RecipeDraft, shortNames = new Map<string, string>()): string {
    const recipe: Recipe = {
        id: makeId(),
        name: findRecipeByName(draft.name) ? draft.name + " (scanned)" : draft.name,
        type: draft.type,
        yieldAmount: draft.yieldAmount,
        yieldUnit: draft.yieldUnit,
        menuPrice: draft.menuPrice,
        producesIngredientId: null,
        laborWage: null,
        laborMinutes: null,
        glass: draft.glass,
        garnish: draft.garnish,
        description: draft.description,
        directions: draft.directions,
        photo: draft.photo,
        createdBy: me()
    };
    if (draft.type === "Prep") {
        const makes = findById(db.ingredients, ingredientFor(draft.name))!;
        recipe.producesIngredientId = makes.id;
        if (makes.housePurchaseUnitId === null && makes.houseRecipeId === null) makes.houseRecipeId = recipe.id;
    }
    db.recipes.push(recipe);
    for (const line of draft.lines) {
        const ingredientId = line.ingredientId ?? ingredientFor(shortNames.get(ingredientKey(line.newName)) ?? line.newName);
        db.recipeLines.push({
            id: makeId(), recipeId: recipe.id, ingredientId, subRecipeId: null,
            choicePurchaseUnitId: null, choiceRecipeId: null,
            amount: line.amount ?? 0,
            unit: line.amount === null ? "" : line.unit || "each",
            countWord: line.amount === null || (line.unit !== "each" && line.unit !== "") ? "" : line.countWord,
            note: line.note
        });
    }
    commit();
    return recipe.id;
}

// Save every ticked draft, prep recipes first -> the new recipes' ids
//     after the preps are saved, other recipes' NEW ingredients with a prep's name
//     use the ingredient that prep makes ("Honey syrup" in a cocktail -> the honey syrup recipe)
export function saveRecipeDrafts(drafts: RecipeDraft[]): string[] {
    const chosen = drafts.filter((d) => d.include);
    const ordered = [...chosen.filter((d) => d.type === "Prep"), ...chosen.filter((d) => d.type !== "Prep")];
    // "Fresh lemon juice" and "Lemon juice" in different recipes -> one ingredient, "Lemon juice"
    const shortNames = new Map(newIngredientNames(drafts).map((n) => [ingredientKey(n), n]));
    return ordered.map((d) => saveRecipeDraft(d, shortNames));
}
