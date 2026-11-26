// ===== lineText.ts =====
// How one ingredient line reads, the same everywhere (scan check, recipe page, spec book):
//     2 onions, chopped          a count: never "2 each onions"
//     3 cloves garlic            a count of something ("clove"), plural when more than one
//     1 1/2 cups flour           a measure (spoken measures read plural)
//     Salt to taste              no amount: the name, then the note
// "each" stays the unit behind the scenes (costing counts in it); it's just never shown.

import { formatFraction } from "./utils";

export interface LineParts {
    amount: number | null;
    unit: string;
    countWord: string;
    note: string;
}

// "clove" -> "cloves", "bunch" -> "bunches", "leaf" -> "leaves" (more than one)
export function plural(word: string, amount: number): string {
    if (word === "" || amount <= 1) return word;
    if (/(lea|loa|hal)f$/.test(word)) return word.slice(0, -1) + "ves";
    if (/[^s]s$/i.test(word)) return word;                                         // already plural: "eggs"
    if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";               // "berry" -> "berries"
    if (/(ch|sh|x|s)$/.test(word)) return word + "es";
    return word + "s";
}

// The amount part on its own: "2", "3 cloves", "1/2 cup", "" (none)
export function amountText(line: LineParts): string {
    if (line.amount === null || line.amount <= 0) return "";
    const number = formatFraction(line.amount);
    if (line.unit === "each" || line.unit === "") return line.countWord ? number + " " + plural(line.countWord, line.amount) : number;
    return number + " " + (SPOKEN.has(line.unit) ? plural(line.unit, line.amount) : line.unit);
}

// Measures people say in the plural ("2 cups"); short ones stay as is ("2 tbsp", "2 fl oz")
const SPOKEN = new Set(["cup", "pint", "quart", "gallon"]);

// The whole line
//     amount        -> "2 onions, chopped"
//     no amount     -> "Salt to taste" (the name starts with a capital)
export function lineText(line: LineParts, name: string): string {
    const amount = amountText(line);
    if (amount === "") {
        const named = name.charAt(0).toUpperCase() + name.slice(1);
        return line.note ? named + " " + line.note : named;
    }
    // A bare count of the thing itself: "2 onions", not "2 onion"
    const bareCount = (line.unit === "each" || line.unit === "") && line.countWord === "";
    const shown = bareCount ? plural(name, line.amount ?? 0) : name;
    return amount + " " + shown + (line.note ? ", " + line.note : "");
}

// For unit pickers: "each" reads as "count" (it's what the amount means)
export function unitLabel(unit: string): string {
    return unit === "each" ? "count" : unit;
}
