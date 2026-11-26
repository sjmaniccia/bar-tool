import { describe, expect, test, beforeEach } from "vitest";
import { combine, guessSection, addRecipesToList, createList, itemsOn, type Part } from "./groceries";
import { db, emptyData, showData } from "./storage";
import type { Recipe } from "./types";

const part = (name: string, amount: number | null, unit: string, from = "A", countWord = ""): Part => ({ name, amount, unit, countWord, from });

describe("combining", () => {
    test("counts add, measures convert, to-taste once", () => {
        const out = combine([
            part("Onion", 2, "each", "Stuffing"), part("onion", 1, "each", "Green beans"),
            part("Butter", 4, "tbsp", "Stuffing"), part("Butter", 0.5, "cup", "Rolls"),
            part("Garlic", 3, "each", "Stuffing", "clove"), part("Garlic", 1, "each", "Roast", "head"),
            part("Salt", null, "", "Stuffing"), part("Salt", null, "", "Rolls"),
            part("Chicken broth", 2, "cup", "Stuffing"), part("Chicken broth", 1, "cup", "Gravy")
        ]);
        const by = (n: string, cw = "") => out.filter((c) => c.name.toLowerCase() === n.toLowerCase() && c.countWord === cw);
        expect(by("onion")[0]).toMatchObject({ amount: 3, unit: "each", from: ["Stuffing", "Green beans"] });
        expect(by("butter")[0]).toMatchObject({ amount: 0.75, unit: "cup" });
        expect(by("garlic", "clove")[0]).toMatchObject({ amount: 3 });
        expect(by("garlic", "head")[0]).toMatchObject({ amount: 1 });
        expect(by("salt")).toHaveLength(1);
        expect(by("salt")[0].amount).toBeNull();
        expect(by("chicken broth")[0]).toMatchObject({ amount: 3, unit: "cup" });
    });
    test("counts round up; lots of spoons become cups", () => {
        expect(combine([part("Celery", 4.5, "each", "A", "rib")])[0].amount).toBe(5);
        expect(combine([part("Butter", 6, "tbsp"), part("Butter", 6, "Tbsp")])[0]).toMatchObject({ amount: 0.75, unit: "cup" });
    });
    test("pounds and cups of the same thing stay apart", () => {
        expect(combine([part("Butter", 1, "lb"), part("Butter", 1, "cup")])).toHaveLength(2);
    });
});

describe("sections", () => {
    test("a few general ones", () => {
        expect(guessSection("Yellow onion")).toBe("Produce");
        expect(guessSection("Dried sage")).toBe("Pantry");
        expect(guessSection("Chicken broth")).toBe("Pantry");
        expect(guessSection("Turkey")).toBe("Meat & seafood");
        expect(guessSection("Butter")).toBe("Dairy & eggs");
        expect(guessSection("Eggs")).toBe("Dairy & eggs");
        expect(guessSection("Paper towels")).toBe("Other");
        expect(guessSection("Cornbread")).toBe("Pantry");
    });
});

describe("a list from recipes", () => {
    beforeEach(() => {
        const data = emptyData();
        data.ingredients.push({ id: "onion", name: "Onion" } as never, { id: "butter", name: "Butter" } as never);
        const r = (id: string, name: string, serves: number) => ({ id, name, yieldAmount: serves, yieldUnit: "serving", createdBy: "" }) as unknown as Recipe;
        data.recipes.push(r("s", "Stuffing", 8), r("b", "Beans", 4));
        const line = (id: string, recipeId: string, ingredientId: string, amount: number, unit: string) =>
            ({ id, recipeId, ingredientId, subRecipeId: null, amount, unit, countWord: "", note: "" }) as never;
        data.recipeLines.push(line("1", "s", "onion", 2, "each"), line("2", "s", "butter", 4, "Tbsp"), line("3", "b", "onion", 1, "each"));
        showData(data);
    });
    test("combines, scales, and adding more keeps what's in the cart", () => {
        const id = createList("Thanksgiving", true);
        addRecipesToList(id, ["s", "b"], null);
        expect(itemsOn(id).find((i) => i.name === "Onion")).toMatchObject({ amount: 3, section: "Produce", forRecipes: "Stuffing, Beans", shared: true });
        db.groceryItems.find((i) => i.name === "Butter")!.checked = true;
        addRecipesToList(id, ["s"], 16);        // twice the stuffing
        expect(itemsOn(id).find((i) => i.name === "Onion")!.amount).toBe(7);
        const butter = itemsOn(id).filter((i) => i.name === "Butter");
        expect(butter.map((b) => [b.checked, b.amount, b.unit])).toEqual([[true, 0.25, "cup"], [false, 0.5, "cup"]]);
    });
});
