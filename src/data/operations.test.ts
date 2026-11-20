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
import { importSales, linkPosItem, matchRecipe, varianceReport } from "./variance";

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

describe("variance (sold vs used)", () => {
    const ML_PER_OZ = 29.5735;

    test("rum: 200 Daiquiris sold, 3 comped, 14.6 bottles gone", () => {
        const report = varianceReport("c-0", "c-1")!;
        const rum = report.rows.find((r) => r.formatId === "f-rum")!;
        expect(rum.actual).toBeCloseTo(18 + 12 - 15.4);                 // opening + delivered - closing
        expect(rum.theoretical).toBeCloseTo(200 * 2 * ML_PER_OZ / 1000); // 2 fl oz per drink, 1 L bottles
        expect(rum.waste).toBeCloseTo(3 * 2 * ML_PER_OZ / 1000);
        expect(rum.variance).toBeCloseTo(2.59, 1);                       // about 2.6 bottles missing
    });

    test("limes come through the fresh lime juice prep", () => {
        const report = varianceReport("c-0", "c-1")!;
        const limes = report.rows.find((r) => r.formatId === "f-lime")!;
        // 430 drinks × 1 fl oz juice; 10 limes make 8 fl oz (the 3 comped Daiquiris count as waste)
        expect(limes.theoretical).toBeCloseTo(430 / 8 * 10);
    });

    test("matching a POS item fixes its variance and is remembered", () => {
        const before = varianceReport("c-0", "c-1")!;
        expect(before.unmatchedSales).toBe(2);
        linkPosItem("Lookout Lager Pint", "r-lager");
        linkPosItem("Gift Card", "ignore");
        const after = varianceReport("c-0", "c-1")!;
        expect(after.unmatchedSales).toBe(0);
        expect(after.sales).toBe(2200 + 2760 + 1080);   // the gift card no longer counts as sales
        const lager = after.rows.find((r) => r.formatId === "f-lager")!;
        expect(lager.variance).toBeLessThan(0.1);
        expect(matchRecipe("lookout lager pint").recipeId).toBe("r-lager");
    });

    test("pour cost = what was used ÷ sales", () => {
        const report = varianceReport("c-0", "c-1")!;
        expect(report.pourCost).toBeCloseTo(report.usedValue / report.sales);
        expect(report.idealPourCost!).toBeLessThan(report.pourCost!);
    });

    test("imports add up the same item on several rows", () => {
        const id = importSales("test.csv", "2026-11-16", "2026-11-22", [
            { itemName: "Daiquiri", quantity: 10, revenue: 110 },
            { itemName: "daiquiri ", quantity: 5, revenue: 55 }
        ]);
        const lines = db.salesLines.filter((l) => l.importId === id);
        expect(lines.length).toBe(1);
        expect(lines[0].quantity).toBe(15);
        expect(lines[0].recipeId).toBe("r-daiquiri");
    });
});
