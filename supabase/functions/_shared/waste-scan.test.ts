import { describe, expect, test } from "vitest";
import { cleanWaste, wasteAmount } from "./waste-scan";

describe("waste log scanning", () => {
    test("amounts", () => {
        expect(wasteAmount("1/2")).toBe(0.5);
        expect(wasteAmount("1 1/2")).toBe(1.5);
        expect(wasteAmount("half")).toBe(0.5);
        expect(wasteAmount("2x")).toBe(2);
        expect(wasteAmount("½")).toBe(0.5);
    });
    test("lines: sheet date fills in, unknown reasons are other, blanks dropped", () => {
        const { lines } = cleanWaste({
            sheet_date: "2026-11-27",
            lines: [
                { item: " Tito's ", quantity: "1", unit: "Bottles", reason: "breakage", note: "JM" },
                { item: "marg", quantity: "2", unit: "drinks", reason: "comp", date: "2026-11-26" },
                { item: "", quantity: "1", reason: "spill" },
                { item: "lime juice", quantity: "half", unit: "quart", reason: "nonsense" }
            ]
        });
        expect(lines).toEqual([
            { date: "2026-11-27", item: "Tito's", quantity: 1, unit: "bottle", reason: "breakage", note: "JM" },
            { date: "2026-11-26", item: "marg", quantity: 2, unit: "drink", reason: "comp", note: "" },
            { date: "2026-11-27", item: "lime juice", quantity: 0.5, unit: "quart", reason: "other", note: "" }
        ]);
    });
});
