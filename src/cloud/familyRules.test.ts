import { describe, expect, test } from "vitest";
import { familyBlocked } from "./familyRules";
import { emptyData } from "../data/storage";
import { recordKey, stable, type Change, type Snapshot } from "./records";

const recipe = (id: string, createdBy: string, name = id) => ({ id, name, createdBy });
const line = (id: string, recipeId: string) => ({ id, recipeId, amount: 1 });

describe("family change only their own recipes", () => {
    const base: Snapshot = new Map([
        [recordKey("recipes", "moms"), stable(recipe("moms", "mom"))],
        [recordKey("recipes", "mine"), stable(recipe("mine", "me"))],
        [recordKey("recipeLines", "m1"), stable(line("m1", "moms"))],
        [recordKey("ingredients", "onion"), stable({ id: "onion", name: "Onion" })]
    ]);
    const data = emptyData();
    data.recipes.push(recipe("moms", "mom") as never, recipe("mine", "me") as never, recipe("new", "me") as never);

    test("refuses others' recipes, their lines, renames and settings", () => {
        const changes: Change[] = [
            { kind: "recipes", id: "moms", data: recipe("moms", "mom", "Better") },
            { kind: "recipes", id: "moms", data: recipe("moms", "me") },
            { kind: "recipes", id: "moms", data: null },
            { kind: "recipeLines", id: "m1", data: { ...line("m1", "moms"), amount: 5 } },
            { kind: "recipeLines", id: "m2", data: line("m2", "moms") },
            { kind: "ingredients", id: "onion", data: { id: "onion", name: "Shallot" } },
            { kind: "placeSettings", id: "place", data: { id: "place", recipesOnly: false } }
        ];
        expect(familyBlocked(changes, data, base, "me")).toHaveLength(changes.length);
    });

    test("lets through my recipes, new ones, their lines and new ingredients", () => {
        const changes: Change[] = [
            { kind: "recipes", id: "mine", data: recipe("mine", "me", "Mine, better") },
            { kind: "recipes", id: "new", data: recipe("new", "me") },
            { kind: "recipeLines", id: "n1", data: line("n1", "new") },
            { kind: "recipeLines", id: "x1", data: line("x1", "mine") },
            { kind: "ingredients", id: "sage", data: { id: "sage", name: "Sage" } },
            { kind: "countLines", id: "c", data: { id: "c" } }
        ];
        expect(familyBlocked(changes, data, base, "me")).toEqual([]);
    });
});
