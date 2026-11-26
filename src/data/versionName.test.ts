import { describe, expect, test } from "vitest";
import { versionName } from "./actions";

describe("Make my version names", () => {
    test("adds whose version it is, without stacking", () => {
        expect(versionName("Grandma's Cornbread Stuffing", "Sarah")).toBe("Grandma's Cornbread Stuffing (Sarah's Version)");
        expect(versionName("Grandma's Cornbread Stuffing (Mom's Version)", "Sarah")).toBe("Grandma's Cornbread Stuffing (Sarah's Version)");
        expect(versionName("Pie", "")).toBe("Pie (My Version)");
    });
});
