// ===== utils.js =====
// Small helpers used by every screen. No app data in here.

// Unique ID from the current time plus some random characters
export function makeId() {
    return Date.now().toString() + Math.random().toString(16).slice(2);
}

// Today's date as "2026-11-18". This format sorts correctly as text.
export function today() {
    return new Date().toISOString().slice(0, 10);
}

// Look up one row in any table by its id
export function findById(table, id) {
    for (const row of table) {
        if (row.id === id) {
            return row;
        }
    }
    return null;
}


// ----- Formatting -----

export function formatMoney(amount) {
    return "$" + amount.toFixed(2);
}

// Show an amount with at most 2 decimals and no trailing zeros: 1.5, 2, 0.25
export function formatAmount(amount) {
    return String(Number(amount.toFixed(2)));
}


// ----- Forms -----

export function readField(id) {
    return document.getElementById(id).value.trim();
}

export function writeField(id, value) {
    document.getElementById(id).value = value;
}


// ----- Building elements -----
// All of these use textContent, so user input always shows as
// plain text and never runs as code (XSS protection).

export function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text) {
        element.textContent = text;
    }
    return element;
}

// Tapping this on a phone starts a call
export function makePhoneLink(number) {
    const link = makeElement("a", "", number);
    link.href = "tel:" + number.replace(/[^0-9+]/g, ""); // digits only
    return link;
}

export function makeButton(text, className, onClick) {
    const button = makeElement("button", className, text);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
}

// Clear a list and show/hide its "nothing here yet" message
export function resetList(listId, emptyId, count) {
    document.getElementById(listId).innerHTML = "";
    document.getElementById(emptyId).hidden = count > 0;
    return document.getElementById(listId);
}
