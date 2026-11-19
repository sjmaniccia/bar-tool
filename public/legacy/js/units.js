// ===== units.js =====
// Every unit the app understands, grouped into families.
// Conversions only work inside a family: fl oz <-> ml is fine,
// each <-> ml is not. Each unit records how many base units it equals.
//
//     VOLUME   base: ml
//     WEIGHT   base: g
//     COUNT    base: each
//     SERVING  base: serving   (only for what a recipe makes)
//
// Note "fl oz" (volume) and "oz (wt)" (weight) are different units.
// Bars and kitchens both just say "oz", so the app keeps them apart.

const UNITS = {
    "ml":      { family: "volume", toBase: 1 },
    "L":       { family: "volume", toBase: 1000 },
    "tsp":     { family: "volume", toBase: 4.92892 },    // teaspoon
    "Tbsp":    { family: "volume", toBase: 14.7868 },    // tablespoon = 3 tsp
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

// The unit each family's costs are shown in, e.g. "$0.68/fl oz"
const DISPLAY_UNIT = {
    volume: "fl oz",
    weight: "lb",
    count: "each",
    serving: "serving"
};

// Units you can buy something in (you can't buy "a serving")
export const PURCHASE_UNITS = Object.keys(UNITS).filter(function (unit) {
    return UNITS[unit].family !== "serving";
});

// Units a recipe can make
export const YIELD_UNITS = Object.keys(UNITS);


export function familyOf(unit) {
    if (UNITS[unit] === undefined) {
        return null;
    }
    return UNITS[unit].family;
}

export function displayUnitFor(unit) {
    return DISPLAY_UNIT[familyOf(unit)];
}

export function unitsInFamily(family) {
    const result = [];
    for (const unit of Object.keys(UNITS)) {
        if (UNITS[unit].family === family) {
            result.push(unit);
        }
    }
    return result;
}

// Convert an amount between units in the same family.
// Returns null if the units can't be converted (different families).
export function convert(amount, fromUnit, toUnit) {
    if (familyOf(fromUnit) === null || familyOf(fromUnit) !== familyOf(toUnit)) {
        return null;
    }
    return amount * UNITS[fromUnit].toBase / UNITS[toUnit].toBase;
}

// Fill a <select> with unit options, keeping one selected
export function fillUnitSelect(select, units, selectedUnit) {
    select.innerHTML = "";
    for (const unit of units) {
        select.append(new Option(unit, unit));
    }
    if (units.includes(selectedUnit)) {
        select.value = selectedUnit;
    }
}
