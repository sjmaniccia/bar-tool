import { describe, expect, test } from "vitest";
import { amountText, lineText, plural, unitLabel } from "./lineText";

const line = (amount: number | null, unit: string, countWord = "", note = "") => ({ amount, unit, countWord, note });

describe("how an ingredient line reads", () => {
    test("counts never say each", () => {
        expect(lineText(line(2, "each", "", "chopped"), "onions")).toBe("2 onions, chopped");
        expect(lineText(line(3, "each", "clove"), "garlic")).toBe("3 cloves garlic");
        expect(lineText(line(1, "each", "clove"), "garlic")).toBe("1 clove garlic");
        expect(lineText(line(1, "each", "can"), "cream of mushroom soup")).toBe("1 can cream of mushroom soup");
        expect(lineText(line(2, "each", "bunch"), "sage")).toBe("2 bunches sage");
        expect(amountText(line(0.5, "each"))).toBe("1/2");
        expect(lineText(line(2, "each", "", "chopped"), "Onion")).toBe("2 Onions, chopped");
        expect(lineText(line(3, "each"), "eggs")).toBe("3 eggs");
        expect(lineText(line(1, "each"), "lemon")).toBe("1 lemon");
    });

    test("measures and no amount", () => {
        expect(lineText(line(1.5, "cup"), "flour")).toBe("1 1/2 cups flour");
        expect(lineText(line(null, "", "", "to taste"), "salt")).toBe("Salt to taste");
        expect(lineText(line(0, "", "", "top"), "prosecco")).toBe("Prosecco top");
        expect(lineText(line(null, ""), "parsley")).toBe("Parsley");
        expect(lineText(line(2, "tbsp"), "butter")).toBe("2 tbsp butter");
        expect(lineText(line(0.75, "fl oz"), "Gin")).toBe("3/4 fl oz Gin");
    });

    test("plurals and labels", () => {
        expect(plural("leaf", 3)).toBe("leaves");
        expect(plural("box", 2)).toBe("boxes");
        expect(plural("stick", 1)).toBe("stick");
        expect(plural("berry", 2)).toBe("berries");
        expect(plural("glass", 2)).toBe("glasses");
        expect(unitLabel("each")).toBe("count");
        expect(unitLabel("cup")).toBe("cup");
    });
});
