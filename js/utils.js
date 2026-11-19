// ===== utils.js =====
// Small helpers every screen uses. No app data in here.


// ===== IDs and dates =====

// Make a unique id from the current time plus random characters
export function makeId() {
    return Date.now().toString() + Math.random().toString(16).slice(2);
}

// The current moment as "2026-11-18T20:27:03.123Z" (sorts correctly as text)
export function now() {
    return new Date().toISOString();
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


// ===== Fractions (recipes are written "1/2 cup", "1 1/2 oz") =====

// Fraction characters people paste in, and what they mean
const FRACTION_CHARACTERS = {
    "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅛": "1/8"
};

// Read an amount typed as a whole number, decimal or fraction
//     "2" -> 2    "0.5" -> 0.5    "1/2" -> 0.5    "1 1/2" -> 1.5    "1½" -> 1.5
//     anything else -> NaN (not a number)
export function parseAmount(text) {
    // Turn "1½" into "1 1/2"
    let cleaned = text.trim();
    for (const [character, fraction] of Object.entries(FRACTION_CHARACTERS)) {
        cleaned = cleaned.replace(character, " " + fraction);
    }
    cleaned = cleaned.trim();
    if (cleaned === "") {
        return NaN;
    }

    // At most two parts: a whole number and a fraction ("1" and "1/2")
    const parts = cleaned.split(/\s+/);   // split on spaces
    if (parts.length > 2) {
        return NaN;
    }

    let total = 0;
    for (const part of parts) {
        if (part.includes("/")) {
            const [top, bottom] = part.split("/");
            const value = Number(top) / Number(bottom);
            if (!isFinite(value)) {
                return NaN;   // catches "1/0", "a/2", "1/"
            }
            total = total + value;
        } else {
            const value = Number(part);
            if (isNaN(value)) {
                return NaN;
            }
            total = total + value;
        }
    }
    return total;
}

// Show an amount the way a recipe would: 0.5 -> "1/2", 1.5 -> "1 1/2", 2 -> "2"
//     IF it's close to a common fraction (halves, thirds, quarters, eighths), use that
//     ELSE show up to 2 decimals
export function formatFraction(amount) {
    const whole = Math.floor(amount);
    const rest = amount - whole;
    if (rest < 0.005) {
        return String(whole);
    }
    for (const bottom of [2, 3, 4, 8]) {
        const top = Math.round(rest * bottom);
        if (top > 0 && top < bottom && Math.abs(rest - top / bottom) < 0.005) {
            const fraction = top + "/" + bottom;
            return whole === 0 ? fraction : whole + " " + fraction;
        }
    }
    return formatAmount(amount);
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