// ===== recipe-scan.test.ts =====
// Checks the clean-up of what Claude reads off a recipe book page.

import { describe, expect, test } from "vitest";
import { amountOf, boxOf, cleanRecipes, countOf, RECIPE_UNITS, singular, unitOf } from "./recipe-scan";
import { YIELD_UNITS } from "../../../src/data/units";

describe("recipe scan clean-up", () => {
    test("the server's unit list matches the app's", () => {
        expect([...RECIPE_UNITS].sort()).toEqual([...YIELD_UNITS].sort());   // YIELD_UNITS = every unit
    });

    test("amounts and units", () => {
        expect(amountOf("1 1/2")).toBe(1.5);
        expect(amountOf("¾")).toBe(0.75);
        expect(amountOf("2 ½")).toBe(2.5);
        expect(amountOf("top")).toBeNull();
        expect(amountOf(0)).toBeNull();
        expect(unitOf("oz", 2)).toBe("fl oz");
        expect(unitOf("dashes", 2)).toBe("dash");
        expect(unitOf("bsp", 1)).toBe("barspoon");
        expect(unitOf("sprigs", 2)).toBe("each");
        expect(unitOf("oz", null)).toBe("");
    });

    test("a spec sheet with two drinks", () => {
        const { recipes, warnings } = cleanRecipes({
            recipes: [
                {
                    name: "Paper Plane", type: "Cocktail", glass: "Coupe", garnish: "", directions: "Shake, double strain.",
                    menu_price: 14, has_photo: true,
                    ingredients: [
                        { amount: 0.75, unit: "fl oz", name: "Bourbon" },
                        { amount: "3/4", unit: "oz", name: "Aperol" },
                        { amount: 0.75, unit: "fl oz", name: "Amaro Nonino" },
                        { amount: 0.75, unit: "fl oz", name: "Lemon juice" }
                    ]
                },
                {
                    name: "House Spritz", type: "Cocktail", glass: "Wine",
                    ingredients: [
                        { amount: 2, unit: "fl oz", name: "Aperol" },
                        { name: "Prosecco", note: "top" },
                        { name: "" }
                    ]
                },
                { name: "", ingredients: [] }
            ]
        });
        expect(warnings).toEqual([]);
        expect(recipes).toHaveLength(2);
        expect(recipes[0]).toMatchObject({ name: "Paper Plane", menuPrice: 14, hasPhoto: true, yieldAmount: 1, yieldUnit: "serving" });
        const none = { countWord: "", unitGuessed: false };
        expect(recipes[0].ingredients[1]).toEqual({ amount: 0.75, unit: "fl oz", name: "Aperol", note: "", ...none });
        expect(recipes[1].ingredients).toEqual([
            { amount: 2, unit: "fl oz", name: "Aperol", note: "", ...none },
            { amount: null, unit: "", name: "Prosecco", note: "top", ...none }
        ]);
    });

    test("a prep recipe keeps its batch size", () => {
        const { recipes } = cleanRecipes({
            recipes: [{ name: "Honey syrup", type: "Prep", yield_amount: 1, yield_unit: "L", ingredients: [{ amount: 500, unit: "g", name: "Honey" }] }]
        });
        expect(recipes[0]).toMatchObject({ type: "Prep", yieldAmount: 1, yieldUnit: "L" });
    });

    test("photo boxes are kept inside the picture, and tiny ones dropped", () => {
        expect(boxOf({ x: 0.5, y: 0.1, w: 0.4, h: 0.3 })).toEqual({ x: 0.5, y: 0.1, w: 0.4, h: 0.3 });
        expect(boxOf({ x: 50, y: 10, w: 40, h: 30 })).toEqual({ x: 0.5, y: 0.1, w: 0.4, h: 0.3 });   // percent
        expect(boxOf({ x: 0.8, y: 0.8, w: 0.5, h: 0.5 })).toEqual({ x: 0.8, y: 0.8, w: 0.2, h: 0.2 });  // clipped
        expect(boxOf({ x: 0.1, y: 0.1, w: 0.02, h: 0.3 })).toBeNull();
        expect(boxOf(undefined)).toBeNull();
        const { recipes } = cleanRecipes({ recipes: [
            { name: "Paper Plane", has_photo: true, photo_box: { x: 0.55, y: 0.05, w: 0.4, h: 0.45 }, ingredients: [{ amount: 0.75, unit: "fl oz", name: "Bourbon" }] },
            { name: "Spritz", has_photo: false, photo_box: { x: 0, y: 0, w: 1, h: 1 }, ingredients: [] }
        ] });
        expect(recipes[0].photoBox).toEqual({ x: 0.55, y: 0.05, w: 0.4, h: 0.45 });
        expect(recipes[1].photoBox).toBeNull();
    });

    test("an empty page says so", () => {
        expect(cleanRecipes({ recipes: [] }).warnings[0]).toMatch(/No recipes/);
    });

    test("counted things keep their word, and a bare number asks", () => {
        expect(singular("cloves")).toBe("clove");
        expect(singular("bunches")).toBe("bunch");
        expect(singular("leaves")).toBe("leaf");
        expect(singular("can")).toBe("can");
        expect(countOf("", "", 2)).toEqual({ countWord: "", unitGuessed: true });
        expect(countOf("each", "cloves", 3)).toEqual({ countWord: "clove", unitGuessed: false });
        expect(countOf("cans", "", 1)).toEqual({ countWord: "can", unitGuessed: false });
        expect(countOf("each", "", 2)).toEqual({ countWord: "", unitGuessed: false });
        expect(countOf("", "", null)).toEqual({ countWord: "", unitGuessed: false });

        const { recipes } = cleanRecipes({ recipes: [{ name: "Mom's stuffing", type: "Dish", serves: 8, ingredients: [
            { amount: 2, unit: "", name: "onions", note: "chopped" },
            { amount: 3, unit: "each", count_word: "cloves", name: "garlic" },
            { amount: 1, unit: "cup", name: "celery" },
            { name: "salt", note: "to taste" }
        ] }] });
        const [onions, garlic, celery, salt] = recipes[0].ingredients;
        expect(recipes[0].serves).toBe(8);
        expect(onions).toMatchObject({ amount: 2, unit: "each", countWord: "", unitGuessed: true, note: "chopped" });
        expect(garlic).toMatchObject({ amount: 3, unit: "each", countWord: "clove", unitGuessed: false });
        expect(celery).toMatchObject({ unit: "cup", countWord: "", unitGuessed: false });
        expect(salt).toMatchObject({ amount: null, unit: "", note: "to taste", unitGuessed: false });
    });
});
