// ===== recipeScan.test.ts =====
// Checks matching scanned recipe ingredients to the sample bar, and saving the recipes.

import { beforeEach, describe, expect, test } from "vitest";
import { db } from "./storage";
import { sampleData } from "./sampleData";
import { recipeIngredientCost } from "./costing";
import { buildRecipeDrafts, matchIngredient, newIngredientNames, saveRecipeDraft, saveRecipeDrafts, type ScannedRecipe } from "./recipeScan";

beforeEach(() => {
    Object.assign(db, sampleData());
});

function recipe(name: string, ingredients: [number | null, string, string, string?][], more: Partial<ScannedRecipe> = {}): ScannedRecipe {
    return {
        name, type: "Cocktail", glass: "Coupe", garnish: "", directions: "Shake.", description: "", menuPrice: null,
        yieldAmount: 1, yieldUnit: "serving", serves: null, hasPhoto: false, photoBox: null,
        ingredients: ingredients.map(([amount, unit, n, note]) => ({ amount, unit, name: n, note: note ?? "", countWord: "", unitGuessed: false })),
        ...more
    };
}

describe("matching ingredients", () => {
    test("exact names, close names, products, and new ones", () => {
        expect(matchIngredient("lime juice")).toEqual({ ingredientId: "i-limejuice", how: "exact" });
        expect(matchIngredient("Fresh-squeezed lime juice")).toEqual({ ingredientId: "i-limejuice", how: "suggested" });
        expect(matchIngredient("Island White Rum")).toEqual({ ingredientId: "i-rum", how: "exact" });   // a product's name
        expect(matchIngredient("Island rum")).toEqual({ ingredientId: "i-rum", how: "suggested" });
        expect(matchIngredient("Aperol")).toEqual({ ingredientId: null, how: "new" });
        expect(matchIngredient("Orange juice").ingredientId).not.toBe("i-orange");                     // not orange liqueur
    });
});

describe("drafts and saving", () => {
    test("a known recipe name is left out unless ticked", () => {
        const [daiquiri, spritz] = buildRecipeDrafts([recipe("Daiquiri", [[2, "fl oz", "White rum"]]), recipe("Spritz", [[2, "fl oz", "Aperol"]])], 1);
        expect(daiquiri).toMatchObject({ include: false, duplicateOf: "r-daiquiri" });
        expect(spritz).toMatchObject({ include: true, duplicateOf: null, page: 1 });
    });

    test("saves recipes with matched and new ingredients, preps first", () => {
        const drafts = buildRecipeDrafts([
            recipe("Honey Daiquiri", [[2, "fl oz", "Island rum"], [0.75, "fl oz", "fresh lime juice"], [0.75, "fl oz", "Honey syrup"]], { menuPrice: 13 }),
            recipe("Spritz", [[2, "fl oz", "Aperol"], [null, "", "Prosecco", "top"]], { glass: "Wine" }),
            recipe("Honey syrup", [[1, "cup", "Honey"], [1, "cup", "Hot water"]], { type: "Prep", yieldAmount: 16, yieldUnit: "fl oz" })
        ], 2);
        // Honey syrup isn't new: the prep recipe in this batch makes it
        expect(newIngredientNames(drafts)).toEqual(["Aperol", "Honey", "Hot water", "Prosecco"]);

        const before = db.ingredients.length;
        const ids = saveRecipeDrafts(drafts);
        expect(ids).toHaveLength(3);
        // Honey syrup was saved first; the daiquiri's "Honey syrup" uses the ingredient it makes
        const syrup = db.recipes.find((r) => r.id === ids[0])!;
        expect(syrup).toMatchObject({ name: "Honey syrup", type: "Prep", yieldAmount: 16, yieldUnit: "fl oz" });
        const honeySyrup = db.ingredients.find((i) => i.name === "Honey syrup")!;
        expect(syrup.producesIngredientId).toBe(honeySyrup.id);
        expect(honeySyrup.houseRecipeId).toBe(syrup.id);

        const daiquiri = db.recipes.find((r) => r.name === "Honey Daiquiri")!;
        const lines = db.recipeLines.filter((l) => l.recipeId === daiquiri.id);
        expect(lines.map((l) => l.ingredientId)).toEqual(["i-rum", "i-limejuice", honeySyrup.id]);
        expect(daiquiri.menuPrice).toBe(13);
        expect(recipeIngredientCost(daiquiri.id)).toBeGreaterThan(0);   // the rum has a price

        const spritz = db.recipes.find((r) => r.name === "Spritz")!;
        expect(spritz.directions).toBe("Shake.");
        const top = db.recipeLines.find((l) => l.recipeId === spritz.id && l.note === "top")!;
        expect(top).toMatchObject({ amount: 0, unit: "", countWord: "" });
        // One of each new ingredient, even used twice
        expect(db.ingredients.length).toBe(before + 5);
    });

    test("the same ingredient written two ways becomes one ingredient", () => {
        const drafts = buildRecipeDrafts([
            recipe("Gold Rush", [[2, "fl oz", "Bourbon"], [0.75, "fl oz", "Fresh lemon juice"]]),
            recipe("Whiskey Sour", [[2, "fl oz", "bourbon"], [0.75, "fl oz", "lemon juice"]])
        ], 1);
        expect(newIngredientNames(drafts)).toEqual(["Bourbon", "Lemon juice"]);
        saveRecipeDrafts(drafts);
        expect(db.ingredients.filter((i) => /lemon/i.test(i.name)).map((i) => i.name)).toEqual(["Lemon juice"]);
        expect(db.ingredients.filter((i) => /bourbon/i.test(i.name))).toHaveLength(1);
    });

    test("a ticked duplicate is saved under a new name", () => {
        const [d] = buildRecipeDrafts([recipe("Daiquiri", [[2, "fl oz", "White rum"]])], 1);
        const [id] = saveRecipeDrafts([{ ...d, include: true }]);
        expect(db.recipes.find((r) => r.id === id)?.name).toBe("Daiquiri (scanned)");
    });

    test("a family recipe: counts keep their word, no close matches, serves becomes servings", () => {
        const stuffing: ScannedRecipe = {
            ...recipe("Mom's stuffing", []), type: "Cocktail", glass: "Coupe", serves: 8,
            ingredients: [
                { amount: 2, unit: "each", countWord: "", unitGuessed: true, name: "onions", note: "chopped" },
                { amount: 3, unit: "each", countWord: "clove", unitGuessed: false, name: "garlic", note: "" },
                { amount: 1, unit: "cup", countWord: "", unitGuessed: false, name: "fresh-squeezed lime juice", note: "" },
                { amount: null, unit: "", countWord: "", unitGuessed: false, name: "salt", note: "to taste" }
            ]
        };
        const [draft] = buildRecipeDrafts([stuffing], 1, true);
        expect(draft).toMatchObject({ type: "Dish", glass: "", yieldAmount: 8, yieldUnit: "serving" });
        expect(draft.lines[0]).toMatchObject({ checkCount: true, note: "chopped" });
        expect(draft.lines[2]).toMatchObject({ how: "new", ingredientId: null });   // no "close match" to Lime juice

        const id = saveRecipeDraft(draft);
        const lines = db.recipeLines.filter((l) => l.recipeId === id);
        expect(lines.map((l) => [l.amount, l.unit, l.countWord, l.note])).toEqual([
            [2, "each", "", "chopped"], [3, "each", "clove", ""], [1, "cup", "", ""], [0, "", "", "to taste"]
        ]);
    });
});
