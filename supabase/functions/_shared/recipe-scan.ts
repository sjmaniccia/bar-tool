// ===== recipe-scan.ts =====
// What Claude is asked to pull off a page of a recipe book, card or spec sheet, and the clean-up after.
// No network in here, so the app's tests can check it.
//
// One photo can hold several recipes (a spec sheet) or one recipe with a picture.
// Claude fills in record_recipes; then cleanRecipes():
//     amounts become numbers ("1 1/2" -> 1.5, "¾" -> 0.75)
//     units become Agave's units ("oz" in a drink -> "fl oz", "dashes" -> "dash")
//     "top with soda", "splash", "to taste" -> no amount, the word kept as a note
//     counted things keep their word: "3 cloves garlic" -> 3 each, count word "clove"
//     a number with no unit ("2 onions") -> a count, marked so the person checks it
//     recipes with no name and no ingredients are dropped

export type ScannedRecipeType = "Cocktail" | "Dish" | "Beer" | "Prep";

export interface ScannedIngredient {
    amount: number | null;     // null = "top", "splash", "to taste"
    unit: string;              // one of RECIPE_UNITS, or "" with no amount
    countWord: string;         // with "each": what's counted, singular ("clove", "can"); "" = the thing itself
    unitGuessed: boolean;      // no unit was written, so it's taken as a count: ask the person
    name: string;              // as printed: "Tito's", "fresh lime juice"
    note: string;              // "top", "rinse", "chopped", "to taste"...
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
    serves: number | null;     // "Serves 8"; null = not written
    ingredients: ScannedIngredient[];
    hasPhoto: boolean;         // the page has a picture of this one
    photoBox: PhotoBox | null; // where that picture is on the photo, so the app can cut it out
}

// Part of the photo, as fractions of its width and height (0 to 1) from the top left
export interface PhotoBox {
    x: number;
    y: number;
    w: number;
    h: number;
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
                        serves: { type: "number", description: "How many people it serves or how many servings it makes, if written (Serves 8 = 8)" },
                        has_photo: { type: "boolean", description: "Is there a picture of this recipe (the drink or dish) on the page?" },
                        photo_box: {
                            type: "object",
                            description: "If has_photo: the picture's position, as fractions of the whole image (0 to 1): left edge x, top edge y, width w, height h. Just the picture, not the text.",
                            properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } }
                        },
                        ingredients: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    amount: { type: "number", description: "As a decimal: 1 1/2 = 1.5, 3/4 = 0.75. Leave out for top, splash, rinse or to taste." },
                                    unit: { type: "string", enum: [...RECIPE_UNITS, ""], description: "Empty when no unit is written (2 onions)" },
                                    count_word: { type: "string", description: "With unit each: the word for what's counted, singular (3 cloves garlic = clove; 1 can soup = can; 2 sticks butter = stick). Empty when the thing itself is counted (2 onions)." },
                                    name: { type: "string", description: "The ingredient as written, including brand" },
                                    note: { type: "string", description: "As written after it: chopped, minced, softened, to taste, top, splash, rinse..." }
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
    "This photo is a page from a recipe book, a recipe card or a bar's spec sheet: a family recipe, a restaurant dish or a drink. It may hold one recipe or several.",
    "Call record_recipes with EVERY recipe on the page, in order. Copy names, ingredients, brands and amounts exactly as written; don't invent or 'fix' anything.",
    "Units: in drinks, oz means fl oz. Ounces of solid food are oz (wt). Use dash for dashes, barspoon for bar spoons.",
    "Counted things: unit each, with what's counted in count_word (3 cloves garlic: amount 3, unit each, count_word clove, name garlic; 1 can cream of mushroom soup: count_word can). If a number has no unit at all (2 onions), leave unit empty.",
    "Put preparation words after an ingredient (chopped, minced, softened) in note, not in name. A dish's type is Dish; family recipes are Dish too unless they're a drink.",
    "cl is 10 ml: convert cl to ml. If an amount is 'top', 'splash', 'rinse' or 'to taste', leave amount out and put that word in note.",
    "Garnish and glass go in their own fields, not in ingredients, unless the garnish is clearly measured (like 3 each blackberries).",
    "If a recipe has a picture of the finished drink or dish, set has_photo and give photo_box around just that picture.",
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

// "cloves" -> "clove", "bunches" -> "bunch", "leaves" -> "leaf": the app adds the s back
export function singular(word: string): string {
    const w = word.trim().toLowerCase();
    if (/(lea|loa|hal)ves$/.test(w)) return w.slice(0, -3) + "f";
    if (/(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
    if (/[^s]s$/.test(w)) return w.slice(0, -1);
    return w;
}

// What a counted line counts, and whether the count is only a guess
//     unit written as a count word ("cloves", "sprigs") -> that word
//     count_word given -> that word
//     no unit written at all -> the thing itself, and ask (unitGuessed)
export function countOf(rawUnit: unknown, rawCountWord: unknown, amount: number | null): { countWord: string; unitGuessed: boolean } {
    if (amount === null) return { countWord: "", unitGuessed: false };
    const unit = typeof rawUnit === "string" ? rawUnit.trim().toLowerCase() : "";
    const given = typeof rawCountWord === "string" ? rawCountWord.trim() : "";
    if (given) return { countWord: singular(given), unitGuessed: false };
    if (unit === "") return { countWord: "", unitGuessed: true };
    if (["each", "ea", "piece", "pieces", "whole"].includes(unit)) return { countWord: "", unitGuessed: false };
    // any other word ("cans", "sprigs", "bunch"): it names what's counted
    return { countWord: singular(unit), unitGuessed: false };
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// A usable box: numbers inside the image, not tiny (a smudge), else null
export function boxOf(raw: unknown): PhotoBox | null {
    const b = (raw ?? {}) as Record<string, unknown>;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
    let x = n(b.x), y = n(b.y), w = n(b.w), h = n(b.h);
    if ([x, y, w, h].some(Number.isNaN)) return null;
    // Some answers come back in percent: 0-100
    if (x > 1 || y > 1 || w > 1 || h > 1) { x /= 100; y /= 100; w /= 100; h /= 100; }
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    w = Math.min(w, 1 - x);
    h = Math.min(h, 1 - y);
    if (w < 0.08 || h < 0.08) return null;
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return { x: r(x), y: r(y), w: r(w), h: r(h) };
}

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
            const unit = unitOf(g.unit, amount);
            const count = unit === "each" ? countOf(g.unit, g.count_word, amount) : { countWord: "", unitGuessed: false };
            ingredients.push({ amount, unit, countWord: count.countWord, unitGuessed: count.unitGuessed, name, note: text(g.note) });
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
            serves: typeof x.serves === "number" && x.serves > 0 && x.serves < 1000 ? Math.round(x.serves) : null,
            ingredients,
            hasPhoto: x.has_photo === true,
            photoBox: x.has_photo === true ? boxOf(x.photo_box) : null
        });
    }
    if (recipes.length === 0) warnings.push("No recipes could be read on this page. Try a sharper, flatter photo in good light.");
    return { recipes, warnings };
}
