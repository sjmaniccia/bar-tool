// ===== recipe-scan.test.ts =====
// Checks the clean-up of what Claude reads off a recipe book page.

import { describe, expect, test } from "vitest";
import { amountOf, cleanRecipes, RECIPE_UNITS, unitOf } from "./recipe-scan";
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
        expect(recipes[0].ingredients[1]).toEqual({ amount: 0.75, unit: "fl oz", name: "Aperol", note: "" });
        expect(recipes[1].ingredients).toEqual([
            { amount: 2, unit: "fl oz", name: "Aperol", note: "" },
            { amount: null, unit: "", name: "Prosecco", note: "top" }
        ]);
    });

    test("a prep recipe keeps its batch size", () => {
        const { recipes } = cleanRecipes({
            recipes: [{ name: "Honey syrup", type: "Prep", yield_amount: 1, yield_unit: "L", ingredients: [{ amount: 500, unit: "g", name: "Honey" }] }]
        });
        expect(recipes[0]).toMatchObject({ type: "Prep", yieldAmount: 1, yieldUnit: "L" });
    });

    test("an empty page says so", () => {
        expect(cleanRecipes({ recipes: [] }).warnings[0]).toMatch(/No recipes/);
    });
});
