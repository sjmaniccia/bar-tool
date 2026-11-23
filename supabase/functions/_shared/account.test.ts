import { describe, expect, test } from "vitest";
import { deletionPlan } from "./account";

describe("deleting an account", () => {
    test("a place you own alone goes with you; others you just leave", () => {
        const plan = deletionPlan([
            { barId: "a", barName: "Mine", role: "owner", owners: 1, others: 3 },
            { barId: "b", barName: "Shared", role: "owner", owners: 2, others: 1 },
            { barId: "c", barName: "Where I work", role: "staff", owners: 1, others: 9 }
        ]);
        expect(plan.deleted).toEqual([{ barId: "a", barName: "Mine", others: 3 }]);
        expect(plan.left.map((p) => p.barName)).toEqual(["Shared", "Where I work"]);
    });

    test("no places, nothing to delete but the sign-in", () => {
        expect(deletionPlan([])).toEqual({ deleted: [], left: [] });
    });
});
