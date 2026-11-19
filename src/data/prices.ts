// ===== prices.ts =====
// Price history for purchase units. Any number of prices, even several per day.
// The current price is the one with the latest recordedAt.

import { db } from "./storage";
import { makeId } from "./utils";

// Record a new price (always adds, never replaces, so history is kept)
export function addPrice(purchaseUnitId: string, amount: number, recordedAt: string) {
    db.priceEntries.push({ id: makeId(), purchaseUnitId, amount, recordedAt });
}

// The newest price (0 if there are none)
//     IF two have the exact same time, the one added last wins
export function currentPrice(purchaseUnitId: string): number {
    let newest = null;
    for (const entry of db.priceEntries) {
        if (entry.purchaseUnitId !== purchaseUnitId) {
            continue;
        }
        if (newest === null || entry.recordedAt >= newest.recordedAt) {
            newest = entry;
        }
    }
    return newest === null ? 0 : newest.amount;
}

// FIXME: Price history view, and edit or delete a single price entry
