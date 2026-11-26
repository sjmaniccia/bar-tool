// ===== costing.test.ts =====
// Automatic checks for the cost math. `npm test` runs these, and so does
// GitHub before every deploy, so a math mistake can't reach the live site.
// Each test sets up known data, runs a function, and checks the answer.

import { beforeEach, describe, expect, test } from "vitest";
import { db } from "./storage";
import { sampleData } from "./sampleData";
import { findById, parseAmount, formatFraction } from "./utils";
import { recipeIngredientCost, recipeLaborCost, summarize, sourceForLine, usesRecipe, ingredientMakesLoop } from "./costing";

beforeEach(() => {
    Object.assign(db, sampleData());   // fresh sample data before every test
});

const recipe = (id: string) => findById(db.recipes, id)!;   // ! = "I know this isn't null"

describe("fractions", () => {
    test("reads common ways of writing amounts", () => {
        expect(parseAmount("1/2")).toBe(0.5);
        expect(parseAmount("1 1/2")).toBe(1.5);
        expect(parseAmount("¾")).toBe(0.75);
        expect(parseAmount("abc")).toBeNaN();
    });
    test("shows amounts the way recipes are written", () => {
        expect(formatFraction(0.75)).toBe("3/4");
        expect(formatFraction(1.5)).toBe("1 1/2");
        expect(formatFraction(2)).toBe("2");
    });
});

describe("in-house preps", () => {
    test("fresh lime juice: 10 limes at $0.20 = $2.00 per 8 fl oz batch", () => {
        expect(recipeIngredientCost("r-limejuice")).toBeCloseTo(2.0);
    });
    test("lime juice labor: $20/hr for 10 minutes = $3.33 per batch", () => {
        expect(recipeLaborCost("r-limejuice")).toBeCloseTo(3.333, 2);
    });
});

describe("daiquiri", () => {
    // Rum: house = case of 12 × 1 L at $210 = $17.50/L -> 2 fl oz = $1.035
    // Lime juice: house = fresh, $2.00 / 8 fl oz -> 1 fl oz = $0.25
    // Syrup: no house, only source is the in-house recipe:
    //     2 lb sugar from 6 × 4 lb at $18 = $0.75/lb -> $1.50 / 32 fl oz -> 3/4 fl oz = $0.035
    test("ingredient cost adds up every line", () => {
        expect(recipeIngredientCost("r-daiquiri")).toBeCloseTo(1.035 + 0.25 + 0.0352, 2);
    });
    test("labor includes its share of in-house preps", () => {
        // own: $20 × 1 min = $0.333; lime juice: $3.333 × 1/8 = $0.417; syrup: $1.667 × 0.75/32 = $0.039
        expect(recipeLaborCost("r-daiquiri")).toBeCloseTo(0.333 + 0.417 + 0.039, 2);
    });
    test("summary: profit = menu price - ingredient - labor", () => {
        const s = summarize(recipe("r-daiquiri"));
        expect(s.profit).toBeCloseTo(11 - s.ingredientCost - s.laborCost);
        expect(s.missing).toEqual([]);
    });
    test("uses the house choice for rum, and says why", () => {
        const rumLine = db.recipeLines.find((l) => l.id === "l-3")!;
        const pick = sourceForLine(rumLine)!;
        expect(pick.reason).toBe("house");
        expect(pick.source.kind === "unit" && pick.source.unit.id).toBe("pu-rum-case");
    });
});

describe("missing prices and loops", () => {
    test("an ingredient with no sources is listed as missing", () => {
        db.recipeLines.push({ id: "x", recipeId: "r-daiquiri", ingredientId: "i-new", subRecipeId: null,
            choicePurchaseUnitId: null, choiceRecipeId: null, amount: 1, unit: "fl oz", countWord: "", note: "" });
        db.ingredients.push({ id: "i-new", name: "Mint", housePurchaseUnitId: null, houseRecipeId: null });
        expect(summarize(recipe("r-daiquiri")).missing).toEqual(["Mint"]);
    });
    test("lime juice can't be used inside the recipe that makes it", () => {
        expect(ingredientMakesLoop("i-limejuice", "r-limejuice")).toBe(true);
        expect(usesRecipe("r-daiquiri", "r-limejuice")).toBe(true);
    });
});
