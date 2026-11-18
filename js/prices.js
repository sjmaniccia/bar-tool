// ===== prices.js =====
// Price history for items, and what an item really costs per unit.
// Each price entry is { id, itemId, amount, recordedAt }.
// An item can have any number of prices, even several in one day.
//
// recordedAt is when the price took effect, as text that sorts correctly:
//     "2026-11-18T20:27:03.123Z"   a price entered right now
//     "2026-11-10"                 a back-dated invoice (counts as the start of that day)

import { db } from "./storage.js";
import { convert } from "./units.js";
import { makeId } from "./utils.js";


// Record a new price (always adds, never replaces, so history is kept)
export function addPrice(itemId, amount, recordedAt) {
    db.priceEntries.push({
        id: makeId(),
        itemId: itemId,
        amount: amount,
        recordedAt: recordedAt
    });
}

// Get the item's newest price (0 if it has none)
//     Newest = latest recordedAt
//     IF two have the exact same time, the one added last wins
export function currentPrice(itemId) {
    let newest = null;
    for (const entry of db.priceEntries) {
        if (entry.itemId !== itemId) {
            continue;   // skip other items' prices
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

// What one unit of an item really costs, after yield
//     usable = pack count × pack size × yield %
//     cost   = price ÷ usable, converted to the unit asked for
// e.g. $72 brisket, 12 lb, 60% yield: $72 ÷ 7.2 lb = $10/lb
// Returns null if the unit can't convert (limes in ml)
export function costPerUnit(item, unit) {
    const usable = item.packCount * item.packSize * (item.yieldPercent / 100);
    if (usable <= 0) {
        return 0;   // avoid dividing by zero
    }
    const costPerSizeUnit = currentPrice(item.id) / usable;

    // How many of the item's units fit in one of the asked-for unit
    const sizeUnitsPerUnit = convert(1, unit, item.sizeUnit);
    if (sizeUnitsPerUnit === null) {
        return null;
    }
    return costPerSizeUnit * sizeUnitsPerUnit;
}

// Delete every price for an item (used when the item is deleted)
export function deletePricesFor(itemId) {
    db.priceEntries = db.priceEntries.filter(function (entry) {
        return entry.itemId !== itemId;   // keep only other items' prices
    });
}

// FIXME: Price history for one item, newest first
// FIXME: Edit or delete a single price entry (to fix a typo)