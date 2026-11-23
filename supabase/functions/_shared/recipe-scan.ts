// ===== recipe-scan.ts =====
// What Claude is asked to pull off a page of a bar's recipe book, and the clean-up after.
// No network in here, so the app's tests can check it.
//
// One photo can hold several recipes (a spec sheet) or one recipe with a picture.
// Claude fills in record_recipes; then cleanRecipes():
//     amounts become numbers ("1 1/2" -> 1.5, "¾" -> 0.75)
//     units become Agave's units ("oz" in a drink -> "fl oz", "dashes" -> "dash")
//     "top with soda", "splash", "to taste" -> no amount, the word kept as a note
//     recipes with no name and no ingredients are dropped

export type ScannedRecipeType = "Cocktail" | "Dish" | "Beer" | "Prep";

export interface ScannedIngredient {
    amount: number | null;     // null = "top", "splash", "to taste"
    unit: string;              // one of RECIPE_UNITS, or "" with no amount
    name: string;              // as printed: "Tito's", "fresh lime juice"
    note: string;              // "top", "rinse", "fresh", "chilled"...
}

export interface ScannedRecipe {
    name: string;
    type: ScannedRecipeType;
    glass: string;
    garnish: string;
    directions: string;
    description: string;
    menuPrice: number | null;
    yieldAmount: number;       // 1 serving for a drink; a batch size for a prep recipe
    yieldUnit: string;
    ingredients: ScannedIngredient[];
    hasPhoto: boolean;         // the page has a picture of this one (FIXME: keep it)
}

// Agave's measuring units (src/data/units.ts; a test keeps the two lists the same)
export const RECIPE_UNITS = [
    "ml", "L", "tsp", "Tbsp", "dash", "barspoon", "fl oz", "cup", "pint", "quart", "gal", "barrel",
    "g", "kg", "oz (wt)", "lb", "each", "dozen", "serving"
];

export const RECIPE_TOOL = {
    name: "record_recipes",
    description: "Record every recipe on the page exactly as written.",
    input_schema: {
        type: "object",
        properties: {
            recipes: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        type: { type: "string", enum: ["Cocktail", "Dish", "Beer", "Prep"], description: "Prep = a syrup, infusion, batch or sauce made in house" },
                        glass: { type: "string" },
                        garnish: { type: "string" },
                        directions: { type: "string", description: "The method: shake, stir, build, strain... as written" },
                        description: { type: "string", description: "Any story, tasting note or description printed with it" },
                        menu_price: { type: "number" },
                        yield_amount: { type: "number", description: "For prep recipes, how much one batch makes" },
                        yield_unit: { type: "string", enum: RECIPE_UNITS },
                        has_photo: { type: "boolean", description: "Is there a picture of this recipe on the page?" },
                        ingredients: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    amount: { type: "number", description: "As a decimal: 1 1/2 = 1.5, 3/4 = 0.75. Leave out for top, splash, rinse or to taste." },
                                    unit: { type: "string", enum: [...RECIPE_UNITS, ""] },
                                    name: { type: "string", description: "The ingredient as written, including brand" },
                                    note: { type: "string", description: "top, splash, rinse, to taste, fresh..." }
                                },
                                required: ["name"]
                            }
                        }
                    },
                    required: ["name", "ingredients"]
                }
            }
        },
        required: ["recipes"]
    }
};

export const RECIPE_INSTRUCTIONS = [
    "This photo is a page from a bar or restaurant's recipe book or spec sheet. It may hold one recipe or several.",
    "Call record_recipes with EVERY recipe on the page, in order. Copy names, ingredients, brands and amounts exactly as written; don't invent or 'fix' anything.",
    "Units: in drinks, oz means fl oz. Ounces of solid food are oz (wt). Use dash for dashes, barspoon for bar spoons, each for whole items (2 mint sprigs = 2 each).",
    "cl is 10 ml: convert cl to ml. If an amount is 'top', 'splash', 'rinse' or 'to taste', leave amount out and put that word in note.",
    "Garnish and glass go in their own fields, not in ingredients, unless the garnish is clearly measured (like 3 each blackberries).",
    "If part of the page is unreadable, leave those fields out rather than guessing."
].join(" ");

// "1 1/2" -> 1.5, "¾" -> 0.75, 2 -> 2, junk -> null
export function amountOf(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
    if (typeof value !== "string") return null;
    const fractions: Record<string, string> = { "¼": " 1/4", "½": " 1/2", "¾": " 3/4", "⅓": " 1/3", "⅔": " 2/3", "⅛": " 1/8" };
    let text = value.trim();
    for (const [char, frac] of Object.entries(fractions)) text = text.replace(char, frac);
    let total = 0;
    for (const part of text.trim().split(/\s+/)) {
        const frac = part.match(/^(\d+)\/(\d+)$/);
        if (frac) total += Number(frac[1]) / Number(frac[2]);
        else if (/^\d+(\.\d+)?$/.test(part)) total += Number(part);
        else return null;
    }
    return total > 0 ? Math.round(total * 10000) / 10000 : null;
}

// Common ways of writing a unit -> Agave's unit
const UNIT_WORDS: Record<string, string> = {
    "oz": "fl oz", "ounce": "fl oz", "ounces": "fl oz", "fl oz": "fl oz", "floz": "fl oz",
    "dash": "dash", "dashes": "dash", "ds": "dash",
    "barspoon": "barspoon", "barspoons": "barspoon", "bsp": "barspoon", "bar spoon": "barspoon",
    "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp", "tbsp": "Tbsp", "tablespoon": "Tbsp", "tablespoons": "Tbsp",
    "ml": "ml", "l": "L", "liter": "L", "litre": "L", "cup": "cup", "cups": "cup",
    "g": "g", "gram": "g", "grams": "g", "kg": "kg", "lb": "lb", "lbs": "lb", "oz (wt)": "oz (wt)",
    "each": "each", "ea": "each", "piece": "each", "pieces": "each", "sprig": "each", "sprigs": "each", "leaf": "each", "leaves": "each",
    "wedge": "each", "wedges": "each", "slice": "each", "slices": "each", "dozen": "dozen"
};

export function unitOf(value: unknown, amount: number | null): string {
    if (amount === null) return "";
    const text = typeof value === "string" ? value.trim() : "";
    if (RECIPE_UNITS.includes(text)) return text;
    return UNIT_WORDS[text.toLowerCase()] ?? "each";
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const TYPES: ScannedRecipeType[] = ["Cocktail", "Dish", "Beer", "Prep"];

export function cleanRecipes(raw: unknown): { recipes: ScannedRecipe[]; warnings: string[] } {
    const r = (raw ?? {}) as Record<string, unknown>;
    const recipes: ScannedRecipe[] = [];
    const warnings: string[] = [];
    for (const item of Array.isArray(r.recipes) ? r.recipes : []) {
        const x = (item ?? {}) as Record<string, unknown>;
        const ingredients: ScannedIngredient[] = [];
        for (const raw of Array.isArray(x.ingredients) ? x.ingredients : []) {
            const g = (raw ?? {}) as Record<string, unknown>;
            const name = text(g.name);
            if (name === "") continue;
            const amount = amountOf(g.amount);
            ingredients.push({ amount, unit: unitOf(g.unit, amount), name, note: text(g.note) });
        }
        const name = text(x.name);
        if (name === "" && ingredients.length === 0) continue;
        const type = TYPES.includes(x.type as ScannedRecipeType) ? x.type as ScannedRecipeType : "Cocktail";
        const yieldAmount = type === "Prep" ? amountOf(x.yield_amount) : null;
        const price = typeof x.menu_price === "number" && x.menu_price > 0 ? x.menu_price : null;
        recipes.push({
            name: name || "Untitled recipe", type,
            glass: text(x.glass), garnish: text(x.garnish), directions: text(x.directions), description: text(x.description),
            menuPrice: price,
            yieldAmount: yieldAmount ?? 1,
            yieldUnit: yieldAmount !== null && RECIPE_UNITS.includes(text(x.yield_unit)) ? text(x.yield_unit) : "serving",
            ingredients,
            hasPhoto: x.has_photo === true
        });
    }
    if (recipes.length === 0) warnings.push("No recipes could be read on this page. Try a sharper, flatter photo in good light.");
    return { recipes, warnings };
}
