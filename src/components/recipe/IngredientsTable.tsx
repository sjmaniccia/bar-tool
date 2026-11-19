// ===== IngredientsTable.tsx =====
// The ingredients table on a recipe page:
//     Quantity | Unit | Ingredient | Source (which product/vendor) | Labor | Cost | remove
// Quantity, unit and source can be changed right in the table.
// The last row adds a new ingredient (type a name; new ones are created).

import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { Recipe, RecipeLine } from "../../data/types";
import { db } from "../../data/storage";
import { findById, formatMoney, parseAmount } from "../../data/utils";
import { PURCHASE_UNITS, displayUnitFor, familyOf, unitsInFamily } from "../../data/units";
import {
    lineIngredientCost, lineLaborCost, sourceForLine, sourcesFor, sourceKey, sourceName, sourceUnit,
    usesRecipe, ingredientMakesLoop
} from "../../data/costing";
import { addLine, findIngredientByName, getOrCreateIngredient, removeLine, setLineChoice, updateLine } from "../../data/actions";
import AmountInput from "../AmountInput";

const RECIPE_PREFIX = "Recipe: ";

// The units a line can use
//     sub-recipe: units in the same family as what it makes
//     ingredient: any unit (conversions decide what can be costed)
function unitsForLine(line: RecipeLine): string[] {
    if (line.subRecipeId !== null) {
        const sub = findById(db.recipes, line.subRecipeId);
        return sub === null ? PURCHASE_UNITS : unitsInFamily(familyOf(sub.yieldUnit));
    }
    return PURCHASE_UNITS;
}

// Why a line is using the source it's using, in plain words
const REASON_TEXT = {
    chosen: "chosen for this recipe",
    house: "house",
    cheapest: "cheapest (no house choice)"
};

// One table row
function LineRow({ line }: { line: RecipeLine }) {
    const ingredient = findById(db.ingredients, line.ingredientId);
    const sub = findById(db.recipes, line.subRecipeId);
    const cost = lineIngredientCost(line);
    const labor = lineLaborCost(line);
    const sources = ingredient ? sourcesFor(ingredient.id) : [];
    const pick = ingredient ? sourceForLine(line) : null;

    // What's shown under the source picker
    let sourceNote = "";
    if (ingredient && sources.length === 0) {
        sourceNote = "No products yet";
    } else if (ingredient && cost === null && pick) {
        sourceNote = "Needs a conversion from " + line.unit + " to " + sourceUnit(pick.source);
    } else if (pick) {
        sourceNote = REASON_TEXT[pick.reason];
    }

    // The in-house recipe behind this line, if any, so its name can link to it
    const linkedRecipe = sub ?? (pick?.source.kind === "recipe" ? pick.source.recipe : null);

    return (
        <tr>
            <td className="qty">
                <AmountInput
                    value={line.amount}
                    className="qty-input"
                    ariaLabel="Quantity"
                    onSave={(value) => value !== null && value > 0 && updateLine(line.id, { amount: value })}
                />
            </td>
            <td className="unit">
                <select value={line.unit} aria-label="Unit" onChange={(e) => updateLine(line.id, { unit: e.target.value })}>
                    {unitsForLine(line).map((u) => <option key={u}>{u}</option>)}
                </select>
            </td>
            <td className="name">
                <strong>{ingredient?.name ?? sub?.name ?? "?"}</strong>
                {sub && <span className="tag">recipe</span>}
                {linkedRecipe && (
                    <div><Link to={"/recipes/" + linkedRecipe.id} className="small">Open recipe →</Link></div>
                )}
            </td>
            <td className="source-cell">
                {ingredient && sources.length > 1 ? (
                    // When a different source is picked, save it as this line's choice
                    <select
                        aria-label="Source"
                        value={line.choicePurchaseUnitId ? "unit:" + line.choicePurchaseUnitId : line.choiceRecipeId ? "recipe:" + line.choiceRecipeId : ""}
                        onChange={(e) => setLineChoice(line.id, e.target.value)}
                    >
                        <option value="">House / cheapest</option>
                        {sources.map((s) => <option key={sourceKey(s)} value={sourceKey(s)}>{sourceName(s)}</option>)}
                    </select>
                ) : pick ? (
                    <span>{sourceName(pick.source)}</span>
                ) : null}
                {sourceNote && <div className={"small " + (cost === null && ingredient ? "warn" : "muted")}>
                    {pick && sources.length > 1 ? sourceName(pick.source) + " · " : ""}{sourceNote}
                </div>}
            </td>
            <td className="num labor" data-label="Labor">{labor > 0 ? formatMoney(labor) : "—"}</td>
            <td className="num cost" data-label="Cost">{cost === null ? <span className="warn">—</span> : formatMoney(cost)}</td>
            <td className="remove no-print">
                <button className="icon-button danger" aria-label="Remove" title="Remove" onClick={() => removeLine(line.id)}>✕</button>
            </td>
        </tr>
    );
}

// The add row at the bottom: [ingredient or recipe name] [amount] [unit] [Add]
function AddRow({ recipe }: { recipe: Recipe }) {
    const [name, setName] = useState("");
    const [amount, setAmount] = useState("");
    const [unit, setUnit] = useState("fl oz");
    const [error, setError] = useState("");

    // Suggestions: every ingredient, plus every recipe that wouldn't make a loop
    const ingredientOptions = db.ingredients.filter((i) => !ingredientMakesLoop(i.id, recipe.id)).map((i) => i.name);
    const recipeOptions = db.recipes.filter((r) => !usesRecipe(r.id, recipe.id)).map((r) => RECIPE_PREFIX + r.name);

    // WHEN a name is typed or picked, start the unit on what it's measured in
    function changeName(value: string) {
        setName(value);
        setError("");
        if (value.startsWith(RECIPE_PREFIX)) {
            const sub = db.recipes.find((r) => r.name === value.slice(RECIPE_PREFIX.length));
            if (sub) setUnit(sub.yieldUnit);
            return;
        }
        const existing = findIngredientByName(value);
        const first = existing ? sourcesFor(existing.id)[0] : undefined;
        if (first) setUnit(displayUnitFor(sourceUnit(first)));
    }

    // WHEN Add is clicked
    //     CHECK the amount is a number
    //     IF it's "Recipe: X", add X as a sub-recipe (unless it would loop)
    //     ELSE add the ingredient, creating it if it's new (unless it would loop)
    function add(event: FormEvent) {
        event.preventDefault();
        const parsed = parseAmount(amount);
        if (name.trim() === "") return setError("Type an ingredient or recipe.");
        if (isNaN(parsed) || parsed <= 0) return setError("Enter an amount like 2, 3/4 or 1 1/2.");

        if (name.startsWith(RECIPE_PREFIX)) {
            const sub = db.recipes.find((r) => r.name === name.slice(RECIPE_PREFIX.length));
            if (!sub) return setError("No recipe with that name.");
            if (usesRecipe(sub.id, recipe.id)) return setError(sub.name + " already uses this recipe.");
            addLine(recipe.id, null, sub.id, parsed, unit);
        } else {
            const existing = findIngredientByName(name);
            if (existing && ingredientMakesLoop(existing.id, recipe.id)) {
                return setError("This recipe makes " + existing.name + ", so it can't use it.");
            }
            addLine(recipe.id, getOrCreateIngredient(name).id, null, parsed, unit);
        }
        setName("");
        setAmount("");
    }

    return (
        <tr className="add-row no-print">
            <td colSpan={7}>
                <form className="add-line" onSubmit={add}>
                    <input
                        className="add-name"
                        list="add-ingredient-options"
                        placeholder="Ingredient (e.g. Lime juice)"
                        value={name}
                        onChange={(e) => changeName(e.target.value)}
                        aria-label="Ingredient"
                    />
                    <datalist id="add-ingredient-options">
                        {ingredientOptions.map((n) => <option key={n} value={n} />)}
                        {recipeOptions.map((n) => <option key={n} value={n} />)}
                    </datalist>
                    <input className="qty-input" placeholder="1 1/2" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
                    <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
                        {PURCHASE_UNITS.concat("serving").map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <button type="submit">+ Add</button>
                </form>
                {error && <p className="error">{error}</p>}
            </td>
        </tr>
    );
}

export default function IngredientsTable({ recipe, lines }: { recipe: Recipe; lines: RecipeLine[] }) {
    return (
        <section className="card table-card">
            <h2>Ingredients</h2>
            <div className="table-scroll">
                <table className="table ingredients">
                    <thead>
                        <tr>
                            <th>Qty</th>
                            <th>Unit</th>
                            <th>Ingredient</th>
                            <th>Source</th>
                            <th className="num">Labor</th>
                            <th className="num">Cost</th>
                            <th className="no-print"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line) => <LineRow key={line.id} line={line} />)}
                        {lines.length === 0 && (
                            <tr><td colSpan={7} className="muted">No ingredients yet. Add the first one below.</td></tr>
                        )}
                        <AddRow recipe={recipe} />
                    </tbody>
                </table>
            </div>
        </section>
    );
}
