// ===== square-orders.test.ts =====
// Checks that Square orders become the right sales per day.

import { describe, expect, test } from "vitest";
import { itemName, localDay, salesByDay, type SquareOrder } from "./square-orders";

const NEW_YORK = -300;   // UTC-5

describe("square orders", () => {
    test("item names drop Square's default variation", () => {
        expect(itemName({ name: "Daiquiri", variation_name: "Regular" })).toBe("Daiquiri");
        expect(itemName({ name: "Lager", variation_name: "Pint" })).toBe("Lager (Pint)");
        expect(itemName({ item_type: "CUSTOM_AMOUNT" })).toBe("Custom amount");
    });

    test("a 11:30 pm order counts on that night, not the next day", () => {
        // 11:30 pm Nov 20 in New York = 04:30 Nov 21 in UTC
        expect(localDay("2026-11-21T04:30:00Z", NEW_YORK)).toBe("2026-11-20");
    });

    test("orders add up per day and item, before tax, after discounts", () => {
        const orders: SquareOrder[] = [
            {
                state: "COMPLETED", closed_at: "2026-11-20T23:00:00Z",
                line_items: [
                    { name: "Daiquiri", variation_name: "Regular", quantity: "2", gross_sales_money: { amount: 2200 } },
                    { name: "Lager", variation_name: "Pint", quantity: "1", gross_sales_money: { amount: 600 }, total_discount_money: { amount: 100 } }
                ]
            },
            {
                state: "COMPLETED", closed_at: "2026-11-21T03:00:00Z",   // 10 pm Nov 20 local
                line_items: [{ name: "Daiquiri", quantity: "1", gross_sales_money: { amount: 1100 } }]
            },
            { state: "OPEN", closed_at: "2026-11-21T03:30:00Z", line_items: [{ name: "Daiquiri", quantity: "9" }] },
            {
                state: "COMPLETED", closed_at: "2026-11-21T20:00:00Z",
                line_items: [{ name: "Daiquiri", quantity: "1", gross_sales_money: { amount: 1100 } }]
            }
        ];
        const days = salesByDay(orders, NEW_YORK);
        expect(days.map((d) => d.date)).toEqual(["2026-11-20", "2026-11-21"]);
        expect(days[0].orders).toBe(2);
        expect(days[0].rows).toEqual([
            { itemName: "Daiquiri", quantity: 3, revenue: 33 },
            { itemName: "Lager (Pint)", quantity: 1, revenue: 5 }
        ]);
        expect(days[1].rows).toEqual([{ itemName: "Daiquiri", quantity: 1, revenue: 11 }]);
    });
});
