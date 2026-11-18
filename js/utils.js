// ===== utils.js =====
// Small helpers every screen uses. No app data in here.


// ===== IDs and dates =====

// Make a unique id from the current time plus random characters
export function makeId() {
    return Date.now().toString() + Math.random().toString(16).slice(2);
}

// Today's date as "2026-11-18" (this format sorts correctly as text)
// FIXME: uses UTC time, so late at night it can read as tomorrow
export function today() {
    return new Date().toISOString().slice(0, 10);
}

// Find the row in a table with this id, or null if none
export function findById(table, id) {
    for (const row of table) {
        if (row.id === id) {
            return row;
        }
    }
    return null;
}


// ===== Formatting =====

// 22.9 -> "$22.90"
export function formatMoney(amount) {
    return "$" + amount.toFixed(2);
}

// Up to 2 decimals, no trailing zeros: 1.50 -> "1.5", 2.00 -> "2"
export function formatAmount(amount) {
    return String(Number(amount.toFixed(2)));
}


// ===== Form fields =====

// Get what's typed in a field, trimmed (always text, even in number fields)
export function readField(id) {
    return document.getElementById(id).value.trim();
}

// Put a value into a field
export function writeField(id, value) {
    document.getElementById(id).value = value;
}


// ===== Building page elements =====
// These all use textContent, so typed text shows as text and never runs as code

// Make an element with an optional class and text
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

// Make a phone link (tapping it on a phone starts a call)
export function makePhoneLink(number) {
    const link = makeElement("a", "", number);
    link.href = "tel:" + number.replace(/[^0-9+]/g, "");   // remove everything except digits and +
    return link;
}

// Make a button. When it's clicked, run onClick.
export function makeButton(text, className, onClick) {
    const button = makeElement("button", className, text);
    button.type = "button";   // so it doesn't submit a form by accident
    button.addEventListener("click", onClick);
    return button;
}

// Empty a list, show the "nothing here" message only if count is 0, return the list
export function resetList(listId, emptyId, count) {
    document.getElementById(listId).innerHTML = "";
    document.getElementById(emptyId).hidden = count > 0;
    return document.getElementById(listId);
}