// ===== operations.test.ts =====
// Checks for stock counts, ordering, invoices and menus, using the sample bar.
// The sample's closed count has rum, tequila, orange liqueur, limes and sugar below par.

import { beforeEach, describe, expect, test } from "vitest";
import { db } from "./storage";
import { sampleData } from "./sampleData";
import { currentPrice } from "./prices";
import { caseSize, countTotals, onHand, setCount, createCount, unitCost } from "./inventory";
import { approveInvoice, createSuggestedOrders, receiveOrder, suggestions, invoiceTotal } from "./purchasing";
import { menuStats, addToMenu, moveItem, itemsOf } from "./menus";
import { findById } from "./utils";

beforeEach(() => {
    Object.assign(db, sampleData());
});

describe("stock counts", () => {
    test("counts cases plus loose bottles", () => {
        // Rum: 1 case of 12 in dry storage + 3.4 bottles on the back bar
        expect(caseSize("f-rum")).toBe(12);
        expect(onHand("f-rum")).toBeCloseTo(15.4);
    });

    test("values stock at the house price per bottle", () => {
        // House rum is the $210 case of 12 = $17.50 a bottle
        expect(unitCost("f-rum")).toBeCloseTo(17.5);
        const totals = countTotals("c-1");
        expect(totals.units.get("f-rum")).toBeCloseTo(15.4);
        expect(totals.value).toBeGreaterThan(15.4 * 17.5);   // plus everything else counted
    });

    test("an open count doesn't change what's on hand", () => {
        const id = createCount("Half done");
        setCount(id, "a-backbar", "f-rum", 5, 0);
        expect(onHand("f-rum")).toBeCloseTo(15.4);   // still the last closed count
    });
});

describe("ordering", () => {
    test("suggests enough cases to get back to par", () => {
        const byVendor = suggestions();
        const sg = byVendor.get("v-sg")!;
        const rum = sg.find((s) => s.unit.id === "pu-rum-case")!;
        // Par 18, have 15.4 -> need 2.6 bottles -> 1 case of 12
        expect(rum.quantity).toBe(1);
        // Lime juice is exactly at par, so it isn't suggested
        expect([...byVendor.values()].flat().some((s) => s.unit.id === "pu-limejuice")).toBe(false);
    });

    test("makes one draft order per vendor", () => {
        expect(createSuggestedOrders()).toBe(3);
        expect(db.orders.every((o) => o.status === "draft")).toBe(true);
    });

    test("doesn't suggest what's already on order", () => {
        createSuggestedOrders();
        expect(suggestions().size).toBe(0);
        expect(createSuggestedOrders()).toBe(0);
    });
});

describe("invoices", () => {
    test("approving records new prices and updates recipe costs", () => {
        createSuggestedOrders();
        const order = db.orders.find((o) => o.vendorId === "v-sg")!;
        const invoiceId = receiveOrder(order.id)!;
        expect(findById(db.orders, order.id)!.status).toBe("received");

        // The rum case came in $10 higher than we had it
        const line = db.invoiceLines.find((l) => l.invoiceId === invoiceId && l.purchaseUnitId === "pu-rum-case")!;
        line.unitPrice = 220;
        expect(invoiceTotal(invoiceId)).toBeGreaterThan(220);

        expect(approveInvoice(invoiceId)).toBe(1);   // only the rum price changed
        expect(currentPrice("pu-rum-case")).toBe(220);
        expect(findById(db.invoices, invoiceId)!.status).toBe("approved");
    });
});

describe("menus", () => {
    test("averages cost and profit across the menu", () => {
        const stats = menuStats("m-fall");
        expect(stats.priced).toBe(2);
        expect(stats.averageCostRatio).toBeGreaterThan(0);
        expect(stats.averageProfit).toBeGreaterThan(0);
    });

    test("adds each recipe once and reorders", () => {
        addToMenu("m-fall", "r-daiquiri");
        expect(itemsOf("m-fall").length).toBe(2);
        moveItem("mi-2", -1);
        expect(itemsOf("m-fall")[0].recipeId).toBe("r-margarita");
    });
});
