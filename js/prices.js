// ===== prices.js =====
// Price history for items, and what an item really costs per unit.
// Each price entry is { itemId, date, amount }, one per item per day.

import { db } from "./storage.js";
import { convert } from "./units.js";


// Record a price for an item on a date
//     IF this item already has a price on this date, replace it
//     ELSE add a new entry (keeps history)
export function setPrice(itemId, amount, date) {
    for (const entry of db.priceEntries) {
        if (entry.itemId === itemId && entry.date === date) {
            entry.amount = amount;
            return;
        }
    }
    db.priceEntries.push({ itemId: itemId, date: date, amount: amount });
}

// Get the item's newest price (0 if it has none)
export function currentPrice(itemId) {
    let newest = null;
    for (const entry of db.priceEntries) {
        if (entry.itemId !== itemId) {
            continue;   // skip other items' prices
        }
        if (newest === null || entry.date > newest.date) {   // "2026-11-18" > "2026-10-01"
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