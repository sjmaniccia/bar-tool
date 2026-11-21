// ===== square-orders.ts =====
// Turns Square orders into sales per day: "Daiquiri, 18 sold, $198" for each day.
// No network or Supabase in here, so the app's tests can check it.
//
//     FOR each completed order:
//         its day = when it closed, in the bar's local time
//         FOR each line item: add its quantity and money to that day's total for that item
//     Money = what was charged before tax: gross sales minus discounts
//     Square sends money in cents and quantities as text ("2"), so both are converted
//
// FIXME: refunds (order "returns") aren't subtracted yet.

export interface SquareMoney {
    amount?: number;    // cents
}

export interface SquareLineItem {
    name?: string;
    variation_name?: string;
    quantity?: string;
    item_type?: string;
    gross_sales_money?: SquareMoney;
    total_discount_money?: SquareMoney;
}

export interface SquareOrder {
    id?: string;
    state?: string;
    closed_at?: string;
    line_items?: SquareLineItem[];
}

export interface SaleRow {
    itemName: string;
    quantity: number;
    revenue: number;    // dollars
}

export interface DaySales {
    date: string;       // "2026-11-20", the bar's local day
    orders: number;
    rows: SaleRow[];
}

// "Margarita" + "Large" -> "Margarita (Large)"; Square's default variation "Regular" is left off
export function itemName(line: SquareLineItem): string {
    const name = (line.name ?? "").trim() || (line.item_type === "CUSTOM_AMOUNT" ? "Custom amount" : "Unnamed item");
    const variation = (line.variation_name ?? "").trim();
    return variation === "" || /^regular$/i.test(variation) ? name : name + " (" + variation + ")";
}

// The local day an order closed on.
// offsetMinutes = minutes to add to UTC for local time (New York in winter = -300)
export function localDay(closedAt: string, offsetMinutes: number): string {
    return new Date(Date.parse(closedAt) + offsetMinutes * 60000).toISOString().slice(0, 10);
}

// Group every order's items by day, then by item name
export function salesByDay(orders: SquareOrder[], offsetMinutes: number): DaySales[] {
    const days = new Map<string, { orders: number; items: Map<string, SaleRow> }>();
    for (const order of orders) {
        if (order.state !== "COMPLETED" || !order.closed_at) continue;
        const date = localDay(order.closed_at, offsetMinutes);
        let day = days.get(date);
        if (!day) {
            day = { orders: 0, items: new Map() };
            days.set(date, day);
        }
        day.orders++;
        for (const line of order.line_items ?? []) {
            const name = itemName(line);
            const quantity = Number.parseFloat(line.quantity ?? "0") || 0;
            const cents = (line.gross_sales_money?.amount ?? 0) - (line.total_discount_money?.amount ?? 0);
            const row = day.items.get(name) ?? { itemName: name, quantity: 0, revenue: 0 };
            row.quantity += quantity;
            row.revenue += cents / 100;
            day.items.set(name, row);
        }
    }
    return [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, day]) => ({
            date,
            orders: day.orders,
            rows: [...day.items.values()].map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 }))
        }));
}
