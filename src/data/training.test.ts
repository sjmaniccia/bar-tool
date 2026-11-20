// ===== training.test.ts =====
// Checks flashcards, quizzes and adding classics, using the sample bar.

import { beforeEach, describe, expect, test } from "vitest";
import { db } from "./storage";
import { sampleData } from "./sampleData";
import { buildQuiz, cardsFor } from "./training";
import { addClassic, CLASSICS } from "./classics";
import { recipeIngredientCost } from "./costing";
import { convert } from "./units";

beforeEach(() => {
    Object.assign(db, sampleData());
});

// A fixed "random" so quizzes come out the same every run
function seeded(seed = 1) {
    return () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
}

describe("training", () => {
    test("cards hold the house spec", () => {
        const daiquiri = cardsFor(null).find((c) => c.name === "Daiquiri")!;
        expect(daiquiri.glass).toBe("Coupe");
        expect(daiquiri.lines.map((l) => l.name)).toEqual(["White rum", "Lime juice", "Simple syrup"]);
    });

    test("every question has its answer among 2 to 4 different choices", () => {
        const quiz = buildQuiz(cardsFor(null), true, 50, seeded());
        expect(quiz.length).toBeGreaterThan(4);
        for (const q of quiz) {
            expect(q.choices.length).toBeGreaterThanOrEqual(2);
            expect(q.choices.length).toBeLessThanOrEqual(4);
            expect(new Set(q.choices).size).toBe(q.choices.length);
            expect(q.answer).toBeGreaterThanOrEqual(0);
        }
    });
});

describe("classics library", () => {
    test("every classic uses units the app knows", () => {
        for (const classic of CLASSICS) {
            for (const [, unit] of classic.build) {
                expect(convert(1, unit, unit), classic.name + " " + unit).not.toBeNull();
            }
        }
    });

    test("adding a classic reuses the bar's ingredients and gets costed", () => {
        const before = db.ingredients.length;
        const id = addClassic(CLASSICS.find((c) => c.name === "Daiquiri")!);
        expect(db.recipes.find((r) => r.id === id)!.name).toBe("Daiquiri (classic)");   // the bar already has one
        expect(db.ingredients.length).toBe(before);                                   // no duplicate rum or lime
        expect(recipeIngredientCost(id)).toBeGreaterThan(0);
    });
});
