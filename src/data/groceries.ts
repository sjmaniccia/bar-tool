// ===== groceries.ts =====
// Grocery lists for recipe books: pick recipes (or a menu), get one list for the store.
//
//     PICK        recipes, and optionally how many you're cooking for (scales each recipe
//                 from its "Serves 8")
//     COMBINE     the same ingredient from different recipes becomes one line:
//                     onions (stuffing) + onions (green beans)      -> 3 onions
//                     4 tbsp butter + 1/2 cup butter                -> 3/4 cup butter
//                     4 1/2 ribs celery (scaled up)                  -> 5 ribs celery (counts round up)
//                     3 cloves garlic + 1 head garlic               -> stay apart (different things)
//                     salt to taste, twice                          -> Salt (no amount), once
//     SECTIONS    a few, like the store: Produce, Meat & seafood, Dairy & eggs, Pantry, Other
//                 guessed from the name; move anything it gets wrong
//     ADD MORE    adding recipes to a list that's already going combines with what's there
//                 (lines already in the cart stay as they are)
//     SHARED      a list is shared with the whole recipe book, or private to its maker
//                 (the server hides private ones from everyone else, recipes-only.sql)

import { db, commit } from "./storage";
import { findById, makeId } from "./utils";
import { convert, familyOf } from "./units";
import { me } from "./me";
import type { GroceryItem, GroceryList, Recipe } from "./types";

export const SECTIONS = ["Produce", "Meat & seafood", "Dairy & eggs", "Pantry", "Other"] as const;

// ===== Which section? =====

// Words that put a thing in a section; anything else edible is Pantry
const SECTION_WORDS: [string, string[]][] = [
    ["Meat & seafood", ["beef", "steak", "chicken", "turkey", "pork", "bacon", "ham", "sausage", "lamb", "veal", "ground",
        "fish", "salmon", "tuna", "cod", "shrimp", "crab", "lobster", "scallop", "clam", "mussel", "prosciutto", "pancetta", "chorizo", "brisket", "ribs"]],
    ["Dairy & eggs", ["milk", "butter", "cream", "cheese", "yogurt", "yoghurt", "egg", "buttermilk", "sour cream", "parmesan",
        "mozzarella", "cheddar", "ricotta", "half and half", "half-and-half", "creme fraiche", "ghee"]],
    ["Produce", ["onion", "garlic", "celery", "carrot", "potato", "tomato", "lettuce", "spinach", "kale", "cabbage", "pepper",
        "jalapeno", "chile", "chili", "lemon", "lime", "orange", "apple", "pear", "banana", "berry", "berries", "grape", "herb",
        "parsley", "cilantro", "basil", "thyme", "rosemary", "sage", "mint", "dill", "chive", "scallion", "shallot", "leek",
        "ginger", "mushroom", "zucchini", "squash", "pumpkin", "corn", "bean sprout", "green bean", "pea", "broccoli",
        "cauliflower", "cucumber", "avocado", "sweet potato", "yam", "beet", "radish", "fennel", "asparagus", "eggplant",
        "cranberr", "peach", "plum", "cherry", "cherries", "mango", "pineapple", "melon", "fruit", "salad", "greens"]],
    ["Other", ["paper towel", "foil", "plastic wrap", "napkin", "plate", "cup ", "bag", "soap", "candle", "toothpick", "skewer", "ice"]]
];

// Dried, canned or ground versions of produce are pantry things ("dried sage", "garlic powder")
const PANTRY_WORDS = ["dried", "dry ", "powder", "ground ", "canned", "can of", "jar", "paste", "sauce", "flakes", "extract",
    "juice concentrate", "broth", "stock", "oil", "vinegar", "flour", "sugar", "salt", "black pepper", "pepper and",
    "bread", "meal", "starch", "syrup", "chips", "cracker", "cereal", "jam", "jelly", "pie filling", "soup"];

export function guessSection(name: string): string {
    const n = " " + name.toLowerCase() + " ";
    for (const [section, words] of SECTION_WORDS) {
        if (!words.some((w) => n.includes(w))) continue;
        if (section === "Produce" && PANTRY_WORDS.some((w) => n.includes(w))) return "Pantry";
        if (section === "Meat & seafood" && /\b(broth|stock|bouillon)\b/.test(n)) return "Pantry";
        return section;
    }
    return "Pantry";
}

// ===== Combining =====

// One measured thing to buy, before combining
export interface Part {
    name: string;
    amount: number | null;
    unit: string;
    countWord: string;
    from: string;          // recipe name ("" = added by hand)
}

// Same unit names, any case ("tbsp" from a scan, "Tbsp" in the app)
const UNIT_NAMES: Record<string, string> = { tbsp: "Tbsp", tablespoon: "Tbsp", teaspoon: "tsp", lbs: "lb", pound: "lb", oz: "oz (wt)", ounce: "oz (wt)" };
function cleanUnit(unit: string): string {
    if (familyOf(unit)) return unit;
    const named = UNIT_NAMES[unit.toLowerCase()];
    if (named) return named;
    const same = ["ml", "L", "tsp", "Tbsp", "fl oz", "cup", "pint", "quart", "gal", "g", "kg", "oz (wt)", "lb", "each", "dozen"]
        .find((u) => u.toLowerCase() === unit.toLowerCase());
    return same ?? unit;
}

// Nearest kitchen-friendly amount: quarters (1/4, 1/2, 3/4), or thirds for 1/3 and 2/3
function tidy(amount: number): number {
    const quarters = Math.round(amount * 4) / 4;
    const thirds = Math.round(amount * 3) / 3;
    const best = Math.abs(thirds - amount) < Math.abs(quarters - amount) ? thirds : quarters;
    return best > 0 ? best : Math.round(amount * 100) / 100 || amount;
}

// A volume in the unit a cook would say: cups from 1/4 cup up, then Tbsp, then tsp
function sayVolume(ml: number, units: Set<string>): { amount: number; unit: string } {
    const spoons = [...units].every((u) => u === "tsp" || u === "Tbsp");
    if (units.size === 1 && !(spoons && ml >= convert(0.25, "cup", "ml")!)) {      // 10 Tbsp reads better as cups
        const only = [...units][0];
        return { amount: tidy(convert(ml, "ml", only)!), unit: only };
    }
    if (ml >= convert(0.25, "cup", "ml")!) return { amount: tidy(convert(ml, "ml", "cup")!), unit: "cup" };
    if (ml >= convert(1, "Tbsp", "ml")!) return { amount: tidy(convert(ml, "ml", "Tbsp")!), unit: "Tbsp" };
    return { amount: tidy(convert(ml, "ml", "tsp")!), unit: "tsp" };
}

function sayWeight(g: number, units: Set<string>): { amount: number; unit: string } {
    if (units.size === 1) {
        const only = [...units][0];
        return { amount: tidy(convert(g, "g", only)!), unit: only };
    }
    if (g >= convert(1, "lb", "g")!) return { amount: tidy(convert(g, "g", "lb")!), unit: "lb" };
    return { amount: tidy(convert(g, "g", "oz (wt)")!), unit: "oz (wt)" };
}

export interface Combined {
    name: string;
    amount: number | null;
    unit: string;
    countWord: string;
    from: string[];
}

// Parts -> one line per thing (and per kind of measure: cups and pounds of butter stay apart)
export function combine(parts: Part[]): Combined[] {
    const groups = new Map<string, { name: string; family: string; countWord: string; total: number; units: Set<string>; from: Set<string>; measured: boolean }>();
    for (const part of parts) {
        const unit = cleanUnit(part.unit);
        const family = part.amount === null || part.amount <= 0 ? "none" : familyOf(unit) ?? "other:" + unit.toLowerCase();
        const countWord = family === "count" ? part.countWord.toLowerCase() : "";
        const key = part.name.trim().toLowerCase() + "|" + family + "|" + countWord;
        const group = groups.get(key) ?? { name: part.name.trim(), family, countWord, total: 0, units: new Set<string>(), from: new Set<string>(), measured: family !== "none" };
        if (group.measured && part.amount !== null) {
            const base = family === "volume" ? convert(part.amount, unit, "ml")
                : family === "weight" ? convert(part.amount, unit, "g")
                : family === "count" ? convert(part.amount, unit, "each")
                : part.amount;
            group.total += base ?? part.amount;
            group.units.add(unit);
        }
        if (part.from) group.from.add(part.from);
        groups.set(key, group);
    }
    return [...groups.values()].map((g) => {
        const from = [...g.from];
        if (!g.measured) return { name: g.name, amount: null, unit: "", countWord: "", from };
        if (g.family === "volume") return { name: g.name, ...sayVolume(g.total, g.units), countWord: "", from };
        if (g.family === "weight") return { name: g.name, ...sayWeight(g.total, g.units), countWord: "", from };
        // You can't buy half an onion: counts round up
        if (g.family === "count") return { name: g.name, amount: Math.ceil(g.total - 0.01), unit: "each", countWord: g.countWord, from };
        return { name: g.name, amount: tidy(g.total), unit: [...g.units][0], countWord: "", from };
    });
}

// ===== From recipes =====

// The parts a recipe needs, scaled to cook for `cookingFor` (null = as written)
export function partsOf(recipe: Recipe, cookingFor: number | null): Part[] {
    const serves = recipe.yieldUnit === "serving" && recipe.yieldAmount > 0 ? recipe.yieldAmount : null;
    const scale = cookingFor !== null && serves !== null ? cookingFor / serves : 1;
    return db.recipeLines.filter((l) => l.recipeId === recipe.id).map((line) => {
        const name = findById(db.ingredients, line.ingredientId)?.name ?? findById(db.recipes, line.subRecipeId)?.name ?? "";
        return {
            name,
            amount: line.amount > 0 ? line.amount * scale : null,
            unit: line.amount > 0 ? line.unit : "",
            countWord: line.countWord,
            from: recipe.name
        };
    }).filter((p) => p.name !== "");
}

// ===== Lists =====

// Lists I can see: shared ones, and my own
export function visibleLists(userId: string): GroceryList[] {
    return db.groceryLists.filter((l) => l.shared || l.createdBy === userId || userId === "");
}

export function itemsOn(listId: string): GroceryItem[] {
    return db.groceryItems.filter((i) => i.listId === listId);
}

export function createList(name: string, shared: boolean): string {
    const id = makeId();
    db.groceryLists.push({ id, name: name.trim() || "Grocery list", createdBy: me(), shared });
    commit();
    return id;
}

// Add recipes to a list: combine them with what's already on it and not yet in the cart
export function addRecipesToList(listId: string, recipeIds: string[], cookingFor: number | null) {
    const list = findById(db.groceryLists, listId);
    if (list === null) return;
    const open = itemsOn(listId).filter((i) => !i.checked);
    const parts: Part[] = open.map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, countWord: i.countWord, from: "" }));
    const fromOld = new Map(open.map((i) => [keyOf(i.name, i.unit, i.amount, i.countWord), i]));
    for (const id of recipeIds) {
        const recipe = findById(db.recipes, id);
        if (recipe) parts.push(...partsOf(recipe, cookingFor));
    }
    const combined = combine(parts);
    // Replace the open lines with the combined ones, keeping each old line's section and "for"
    db.groceryItems = db.groceryItems.filter((i) => i.listId !== listId || i.checked);
    for (const c of combined) {
        const old = fromOld.get(keyOf(c.name, c.unit, c.amount, c.countWord))
            ?? open.find((i) => i.name.toLowerCase() === c.name.toLowerCase());
        const forRecipes = [...new Set([...(old?.forRecipes ? old.forRecipes.split(", ") : []), ...c.from])].join(", ");
        db.groceryItems.push({
            id: old?.id ?? makeId(),
            listId,
            name: c.name,
            amount: c.amount,
            unit: c.unit,
            countWord: c.countWord,
            section: old?.section ?? guessSection(c.name),
            checked: false,
            forRecipes,
            createdBy: old?.createdBy ?? me(),
            shared: list.shared
        });
    }
    commit();
}

function keyOf(name: string, unit: string, amount: number | null, countWord: string): string {
    const family = amount === null ? "none" : familyOf(cleanUnit(unit)) ?? unit;
    return name.toLowerCase() + "|" + family + "|" + (family === "count" ? countWord : "");
}

// Something added by hand ("paper towels", "2 lemons")
export function addItem(listId: string, name: string) {
    const list = findById(db.groceryLists, listId);
    if (list === null || name.trim() === "") return;
    db.groceryItems.push({
        id: makeId(), listId, name: name.trim(), amount: null, unit: "", countWord: "",
        section: guessSection(name), checked: false, forRecipes: "", createdBy: me(), shared: list.shared
    });
    commit();
}

export function updateItem(id: string, change: Partial<GroceryItem>) {
    const item = findById(db.groceryItems, id);
    if (item === null) return;
    Object.assign(item, change);
    commit();
}

export function removeItem(id: string) {
    db.groceryItems = db.groceryItems.filter((i) => i.id !== id);
    commit();
}

export function clearChecked(listId: string) {
    db.groceryItems = db.groceryItems.filter((i) => i.listId !== listId || !i.checked);
    commit();
}

export function updateList(id: string, change: Partial<GroceryList>) {
    const list = findById(db.groceryLists, id);
    if (list === null) return;
    Object.assign(list, change);
    // Items carry the list's sharing, so the server knows who may read them
    if (change.shared !== undefined) for (const item of itemsOn(id)) item.shared = change.shared;
    commit();
}

export function deleteList(id: string) {
    db.groceryLists = db.groceryLists.filter((l) => l.id !== id);
    db.groceryItems = db.groceryItems.filter((i) => i.listId !== id);
    commit();
}

// The list as text, for Messages or Notes: by section, without what's in the cart
export function listText(list: GroceryList, text: (item: GroceryItem) => string): string {
    const items = itemsOn(list.id).filter((i) => !i.checked);
    const lines = [list.name];
    for (const section of SECTIONS) {
        const here = items.filter((i) => i.section === section);
        if (here.length === 0) continue;
        lines.push("", section);
        for (const item of here) lines.push("- " + text(item));
    }
    return lines.join("\n");
}
