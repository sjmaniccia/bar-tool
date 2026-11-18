// ===== items.js =====
// Everything for the Items screen: anything you buy, from a bottle of
// tequila to a case of limes to a sack of malt.

import { db, commit } from "./storage.js";
import { setPrice, currentPrice, costPerUnit, deletePricesFor } from "./prices.js";
import { PURCHASE_UNITS, displayUnitFor, fillUnitSelect } from "./units.js";
import { sortedDistributors } from "./distributors.js";
import {
    makeId, today, findById, formatMoney, formatAmount,
    readField, writeField, makeElement, makeButton, resetList
} from "./utils.js";

export const CATEGORIES = [
    "Liquor", "Wine", "Beer", "Mixer", "Produce", "Meat", "Seafood",
    "Dairy", "Dry goods", "Brewing", "Other"
];


// ----- Data -----

export function sortedItems() {
    return db.items.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });
}

// How many recipe lines use an item (blocks deleting it)
function linesUsingItem(itemId) {
    let count = 0;
    for (const line of db.recipeLines) {
        if (line.itemId === itemId) {
            count++;
        }
    }
    return count;
}

function addItem(fields, price) {
    fields.id = makeId();
    db.items.push(fields);
    setPrice(fields.id, price, today());
    commit();
}

// FIXME: prompt() is quick but ugly. Replace with an inline form later.
function updatePrice(itemId) {
    const item = findById(db.items, itemId);
    if (item === null) {
        return;
    }

    const answer = prompt("New price for " + item.name + ":", currentPrice(itemId).toFixed(2));
    if (answer === null) {
        return; // user hit cancel
    }

    const amount = parseFloat(answer);
    if (isNaN(amount) || amount < 0) {
        alert("That's not a valid price.");
        return;
    }

    setPrice(itemId, amount, today());
    commit();
}

function deleteItem(itemId) {
    const item = findById(db.items, itemId);
    if (item === null) {
        return;
    }

    // Don't leave recipes pointing at an item that no longer exists
    const lineCount = linesUsingItem(itemId);
    if (lineCount > 0) {
        alert("Can't delete " + item.name + ". " + lineCount + " recipe line(s) still use it.");
        return;
    }

    if (!confirm("Delete " + item.name + "?")) {
        return;
    }
    db.items = db.items.filter(function (i) {
        return i.id !== itemId;
    });
    deletePricesFor(itemId); // no orphan price rows left behind
    commit();
}

// FIXME: Edit an item's name, pack, yield, or distributor
// FIXME: Warn when adding an item that already exists


// ----- Drawing -----

// "1000 ml" for a single bottle, "24 × 12 fl oz" for a case
function formatPack(item) {
    const size = formatAmount(item.packSize) + " " + item.sizeUnit;
    if (item.packCount === 1) {
        return size;
    }
    return item.packCount + " × " + size;
}

// Rebuild the distributor dropdown, keeping the current choice
function renderDistributorOptions() {
    const select = document.getElementById("item-distributor");
    const previous = select.value;

    select.innerHTML = "";
    select.append(new Option("No distributor", ""));
    for (const d of sortedDistributors()) {
        select.append(new Option(d.companyName, d.id));
    }

    select.value = previous;
    if (select.value !== previous) {
        select.value = ""; // the old choice was deleted
    }
}

function makeItemItem(item) {
    const li = makeElement("li", "item");
    const info = makeElement("div");

    info.append(makeElement("strong", "", item.name));

    // "Liquor · 1000 ml · $22.99 · $0.68/fl oz"
    const unit = displayUnitFor(item.sizeUnit);
    let detailText = item.category
        + " · " + formatPack(item)
        + " · " + formatMoney(currentPrice(item.id))
        + " · " + formatMoney(costPerUnit(item, unit)) + "/" + unit;
    if (item.yieldPercent < 100) {
        detailText += " · " + formatAmount(item.yieldPercent) + "% yield";
    }
    info.append(makeElement("span", "details", detailText));

    const distributor = findById(db.distributors, item.distributorId);
    if (distributor !== null) {
        info.append(makeElement("span", "details", distributor.companyName));
    }

    const buttons = makeElement("div", "buttons");
    buttons.append(
        makeButton("New price", "secondary", function () { updatePrice(item.id); }),
        makeButton("Delete", "danger", function () { deleteItem(item.id); })
    );

    li.append(info, buttons);
    return li;
}

export function renderItems() {
    renderDistributorOptions();

    const list = resetList("item-list", "item-empty", db.items.length);
    for (const item of sortedItems()) {
        list.append(makeItemItem(item));
    }
}


// ----- Setup (runs once on page load) -----

export function initItems() {
    const categorySelect = document.getElementById("item-category");
    for (const category of CATEGORIES) {
        categorySelect.append(new Option(category, category));
    }
    fillUnitSelect(document.getElementById("item-size-unit"), PURCHASE_UNITS, "ml");

    document.getElementById("item-form").addEventListener("submit", function (event) {
        event.preventDefault(); // stop the page from reloading

        const fields = {
            name: readField("item-name"),
            category: readField("item-category"),
            packCount: parseInt(readField("item-pack-count")),
            packSize: parseFloat(readField("item-pack-size")),
            sizeUnit: readField("item-size-unit"),
            yieldPercent: parseFloat(readField("item-yield")),
            distributorId: readField("item-distributor") || null  // "" becomes null
        };
        const price = parseFloat(readField("item-price"));

        if (fields.name === "" || isNaN(price) || isNaN(fields.packCount)
            || isNaN(fields.packSize) || isNaN(fields.yieldPercent)) {
            return;
        }

        addItem(fields, price);

        // Clear name and price only. Category, pack, unit and distributor
        // stay, since you often enter several similar items in a row.
        writeField("item-name", "");
        writeField("item-price", "");
        document.getElementById("item-name").focus();
    });
}
