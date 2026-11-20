// ===== utils.ts =====
// Small helpers used everywhere. No app data in here.

// A unique id, built into every modern browser
export function makeId(): string {
    return crypto.randomUUID();
}

// The current moment as "2026-11-18T20:27:03.123Z" (sorts correctly as text)
export function now(): string {
    return new Date().toISOString();
}

// Find the row with this id in any table, or null.
// <T extends { id: string }> means "works on any table whose rows have an id"
export function findById<T extends { id: string }>(table: T[], id: string | null): T | null {
    if (id === null) {
        return null;
    }
    for (const row of table) {
        if (row.id === id) {
            return row;
        }
    }
    return null;
}

// 22.9 -> "$22.90", 6115 -> "$6,115.00", -0.25 -> "-$0.25"
export function formatMoney(amount: number): string {
    const text = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (amount < -0.004 ? "-$" : "$") + text;
}

// 1 -> "1 bottle", 2.5 -> "2.5 bottles"
export function plural(amount: number, word: string): string {
    return formatAmount(amount) + " " + word + (Math.abs(amount - 1) < 0.001 ? "" : "s");
}

// 0.2251 -> "22.5%"
export function formatPercent(ratio: number): string {
    return (ratio * 100).toFixed(1) + "%";
}

// Up to 2 decimals, no trailing zeros: 1.50 -> "1.5", 2.00 -> "2"
export function formatAmount(amount: number): string {
    return String(Number(amount.toFixed(2)));
}


// ===== Fractions (recipes are written "1/2 cup", "1 1/2 oz") =====

const FRACTION_CHARACTERS: Record<string, string> = {
    "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅛": "1/8"
};

// Read an amount typed as a whole number, decimal or fraction
//     "2" -> 2    "0.5" -> 0.5    "1/2" -> 0.5    "1 1/2" -> 1.5    "1½" -> 1.5
//     anything else -> NaN (not a number)
export function parseAmount(text: string): number {
    let cleaned = text.trim();
    for (const [character, fraction] of Object.entries(FRACTION_CHARACTERS)) {
        cleaned = cleaned.replace(character, " " + fraction);
    }
    cleaned = cleaned.trim();
    if (cleaned === "") {
        return NaN;
    }

    // At most two parts: a whole number and a fraction
    const parts = cleaned.split(/\s+/);
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
            total += value;
        } else {
            const value = Number(part);
            if (isNaN(value)) {
                return NaN;
            }
            total += value;
        }
    }
    return total;
}

// Show an amount the way a recipe would: 0.5 -> "1/2", 1.5 -> "1 1/2", 2 -> "2"
//     IF it's close to a common fraction (halves, thirds, quarters, eighths), use that
//     ELSE show up to 2 decimals
export function formatFraction(amount: number): string {
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


// ===== Dates =====

// Today as "2026-11-19" (local time, for date boxes)
export function today(): string {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// "2026-11-19" or a full timestamp -> "Nov 19, 2026"
export function formatDate(value: string): string {
    if (!value) return "—";
    // A bare date is read as local midnight so it doesn't shift a day
    const date = value.length === 10 ? new Date(value + "T00:00:00") : new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
