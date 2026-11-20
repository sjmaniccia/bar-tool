// ===== units.ts =====
// Every unit the app knows, and how to convert between them.
//
// Units come in families. You can only convert inside a family.
//     VOLUME   base ml      (fl oz -> ml works)
//     WEIGHT   base g
//     COUNT    base each    (each -> ml does NOT work without an ingredient conversion)
//     SERVING  only for what a recipe makes
//
// "fl oz" is volume and "oz (wt)" is weight. They are different units.

export type UnitFamily = "volume" | "weight" | "count" | "serving";

interface UnitInfo {
    family: UnitFamily;
    toBase: number;   // how many base units one of this unit equals
}

const UNITS: Record<string, UnitInfo> = {
    "ml":      { family: "volume", toBase: 1 },
    "L":       { family: "volume", toBase: 1000 },
    "tsp":     { family: "volume", toBase: 4.92892 },    // teaspoon
    "Tbsp":    { family: "volume", toBase: 14.7868 },    // tablespoon = 3 tsp
    "dash":    { family: "volume", toBase: 0.92 },       // bitters dash, about 1/32 fl oz
    "barspoon": { family: "volume", toBase: 5 },         // about 1 tsp
    "fl oz":   { family: "volume", toBase: 29.5735 },
    "cup":     { family: "volume", toBase: 236.588 },
    "pint":    { family: "volume", toBase: 473.176 },
    "quart":   { family: "volume", toBase: 946.353 },
    "gal":     { family: "volume", toBase: 3785.41 },
    "barrel":  { family: "volume", toBase: 117347.77 },  // KEG - US beer barrel = 31 gal

    "g":       { family: "weight", toBase: 1 },
    "kg":      { family: "weight", toBase: 1000 },
    "oz (wt)": { family: "weight", toBase: 28.3495 },
    "lb":      { family: "weight", toBase: 453.592 },

    "each":    { family: "count", toBase: 1 },
    "dozen":   { family: "count", toBase: 12 },

    "serving": { family: "serving", toBase: 1 }
};

// Unit to show costs in for each family, e.g. "$0.68/fl oz"
const DISPLAY_UNIT: Record<UnitFamily, string> = {
    volume: "fl oz",
    weight: "lb",
    count: "each",
    serving: "serving"
};

// Units you can buy or measure in (every unit except "serving")
export const PURCHASE_UNITS = Object.keys(UNITS).filter((unit) => UNITS[unit].family !== "serving");

// Units a recipe can make (every unit)
export const YIELD_UNITS = Object.keys(UNITS);

// Get a unit's family, or null if it's not a known unit
export function familyOf(unit: string): UnitFamily | null {
    return UNITS[unit]?.family ?? null;   // ?. and ?? = "if it exists... otherwise null"
}

// Get the unit to show costs in: "ml" -> "fl oz", "kg" -> "lb"
export function displayUnitFor(unit: string): string {
    const family = familyOf(unit);
    return family === null ? unit : DISPLAY_UNIT[family];
}

// Convert an amount between units
//     IF different families, return null
//     ELSE amount × (from -> base) ÷ (to -> base)
// e.g. 8 oz (wt) -> lb: 8 × 28.3495 ÷ 453.592 = 0.5
export function convert(amount: number, fromUnit: string, toUnit: string): number | null {
    const from = UNITS[fromUnit];
    const to = UNITS[toUnit];
    if (from === undefined || to === undefined || from.family !== to.family) {
        return null;
    }
    return amount * from.toBase / to.toBase;
}

// List every unit in a family: "weight" -> ["g", "kg", "oz (wt)", "lb"]
export function unitsInFamily(family: UnitFamily | null): string[] {
    return Object.keys(UNITS).filter((unit) => UNITS[unit].family === family);
}
