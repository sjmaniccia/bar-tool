// ===== pos.test.ts =====
// Checks which days a Square sync asks for.

import { describe, expect, test } from "vitest";
import { addDays, daysToSync, isFinished } from "./pos";

describe("square sync days", () => {
    const done = (day: string) => ({ day, importedOn: addDays(day, 1) });   // imported the next morning
    const partial = (day: string) => ({ day, importedOn: day });            // imported while open

    test("the first sync fetches the last 14 days, through today", () => {
        expect(daysToSync("2026-11-21", [])).toEqual({ start: "2026-11-07", end: "2026-11-21" });
    });

    test("later syncs start after the newest finished day", () => {
        expect(daysToSync("2026-11-21", [done("2026-11-15"), done("2026-11-18")])).toEqual({ start: "2026-11-19", end: "2026-11-21" });
    });

    test("a day imported while it was still going is fetched again", () => {
        expect(daysToSync("2026-11-21", [done("2026-11-19"), partial("2026-11-20")])).toEqual({ start: "2026-11-20", end: "2026-11-21" });
        expect(isFinished(partial("2026-11-20"))).toBe(false);
    });

    test("a long gap is fetched 31 days at a time", () => {
        expect(daysToSync("2026-11-21", [done("2026-01-01")])).toEqual({ start: "2026-01-02", end: "2026-02-01" });
    });

    test("adding days crosses months and clock changes", () => {
        expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
        expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    });
});
