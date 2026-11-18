// ===== prices.js =====
// Price entries are their own table, keyed by item + date.
// Recipes and (later) invoice scanning both use these functions.

import { db } from "./storage.js";
import { convert } from "./units.js";

// One price per item per day. Same day replaces, new day adds.
// Searches the whole table, so back-dated invoices work too.
export function setPrice(itemId, amount, date) {
    for (const entry of db.priceEntries) {
        if (entry.itemId === itemId && entry.date === date) {
            entry.amount = amount;
            return;
        }
    }
    db.priceEntries.push({ itemId: itemId, date: date, amount: amount });
}

// The current price is the entry with the newest date
export function currentPrice(itemId) {
    let newest = null;
    for (const entry of db.priceEntries) {
        if (entry.itemId !== itemId) {
            continue;
        }
        if (newest === null || entry.date > newest.date) {
            newest = entry;
        }
    }
    if (newest === null) {
        return 0;
    }
    return newest.amount;
}

// What one `unit` of this item really costs, after yield.
//     usable amount = packCount × packSize × yield %
//     cost per unit = price ÷ usable amount, converted to `unit`
// Example: $72 brisket, 12 lb at 60% yield = $72 ÷ 7.2 lb = $10/lb
// Returns null if `unit` is in a different family than the item.
export function costPerUnit(item, unit) {
    const usable = item.packCount * item.packSize * (item.yieldPercent / 100);
    if (usable <= 0) {
        return 0;
    }
    const costPerSizeUnit = currentPrice(item.id) / usable;

    // How many of the item's own units are in one requested unit
    const sizeUnitsPerUnit = convert(1, unit, item.sizeUnit);
    if (sizeUnitsPerUnit === null) {
        return null;
    }
    return costPerSizeUnit * sizeUnitsPerUnit;
}

// Remove every price for an item (used when the item is deleted)
export function deletePricesFor(itemId) {
    db.priceEntries = db.priceEntries.filter(function (entry) {
        return entry.itemId !== itemId;
    });
}

// FIXME: Price history for one item, newest first
