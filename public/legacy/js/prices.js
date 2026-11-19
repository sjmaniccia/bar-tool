// ===== prices.js =====
// Price history for purchase units ("a case of 6 Tito's 1.75 L from RNDC").
// Each price entry is { id, purchaseUnitId, amount, recordedAt }.
// A purchase unit can have any number of prices, even several in one day.
// What a price works out to per fl oz, lb or each is in costing.js.
//
// recordedAt is when the price took effect, as text that sorts correctly:
//     "2026-11-18T20:27:03.123Z"   a price entered right now
//     "2026-11-10"                 a back-dated invoice (counts as the start of that day)

import { db } from "./storage.js";
import { makeId } from "./utils.js";


// Record a new price (always adds, never replaces, so history is kept)
export function addPrice(purchaseUnitId, amount, recordedAt) {
    db.priceEntries.push({
        id: makeId(),
        purchaseUnitId: purchaseUnitId,
        amount: amount,
        recordedAt: recordedAt
    });
}

// Get the purchase unit's newest price (0 if it has none)
//     Newest = latest recordedAt
//     IF two have the exact same time, the one added last wins
export function currentPrice(purchaseUnitId) {
    let newest = null;
    for (const entry of db.priceEntries) {
        if (entry.purchaseUnitId !== purchaseUnitId) {
            continue;   // skip other purchase units' prices
        }
        if (newest === null || entry.recordedAt >= newest.recordedAt) {
            newest = entry;
        }
    }
    if (newest === null) {
        return 0;
    }
    return newest.amount;
}

// Delete every price for a purchase unit (used when it's deleted)
export function deletePricesFor(purchaseUnitId) {
    db.priceEntries = db.priceEntries.filter(function (entry) {
        return entry.purchaseUnitId !== purchaseUnitId;   // keep only other units' prices
    });
}

// FIXME: Price history for one purchase unit, newest first
// FIXME: Edit or delete a single price entry (to fix a typo)
