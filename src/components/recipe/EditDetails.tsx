// ===== EditDetails.tsx =====
// The "Edit details" form at the top of a recipe: name, type, yield, menu price,
// what it makes, and the training details (glass, garnish, description, directions).

import { useState, type FormEvent } from "react";
import type { Recipe, RecipeType } from "../../data/types";
import { YIELD_UNITS } from "../../data/units";
import { formatFraction, parseAmount, findById } from "../../data/utils";
import { db } from "../../data/storage";
import { getOrCreateIngredient, findIngredientByName, updateRecipe } from "../../data/actions";
import { recipeUsesIngredient } from "../../data/costing";

const TYPES: RecipeType[] = ["Cocktail", "Dish", "Beer", "Prep"];

interface Props {
    recipe: Recipe;
    onDone: () => void;   // called after Save or Cancel
}

export default function EditDetails({ recipe, onDone }: Props) {
    // The form keeps its own copy while typing, and saves it all at once
    const makes = findById(db.ingredients, recipe.producesIngredientId);
    const [form, setForm] = useState({
        name: recipe.name,
        type: recipe.type,
        yieldAmount: formatFraction(recipe.yieldAmount),
        yieldUnit: recipe.yieldUnit,
        menuPrice: recipe.menuPrice === null ? "" : recipe.menuPrice.toFixed(2),
        makes: makes?.name ?? "",
        glass: recipe.glass,
        garnish: recipe.garnish,
        description: recipe.description,
        directions: recipe.directions
    });
    const [error, setError] = useState("");

    // Change one field of the form copy
    function set(field: keyof typeof form, value: string) {
        setForm({ ...form, [field]: value });
    }

    // WHEN Save is clicked
    //     CHECK the yield and price are numbers, and "makes" wouldn't make a loop
    //     SAVE everything, then close the form
    function save(event: FormEvent) {
        event.preventDefault();
        const yieldAmount = parseAmount(form.yieldAmount);
        const menuPrice = form.menuPrice.trim() === "" ? null : parseFloat(form.menuPrice);
        if (form.name.trim() === "") return setError("Give the recipe a name.");
        if (isNaN(yieldAmount) || yieldAmount <= 0) return setError("Enter how much it makes, like 1 or 1 1/2.");
        if (menuPrice !== null && (isNaN(menuPrice) || menuPrice < 0)) return setError("Enter a valid menu price, or leave it blank.");

        let producesIngredientId: string | null = null;
        if (form.makes.trim() !== "") {
            const existing = findIngredientByName(form.makes);
            if (existing !== null && recipeUsesIngredient(recipe.id, existing.id)) {
                return setError(recipe.name + " already uses " + existing.name + ", so it can't also make it.");
            }
            producesIngredientId = getOrCreateIngredient(form.makes).id;
        }

        updateRecipe(recipe.id, {
            name: form.name.trim(),
            type: form.type as RecipeType,
            yieldAmount,
            yieldUnit: form.yieldUnit,
            menuPrice,
            producesIngredientId,
            glass: form.glass.trim(),
            garnish: form.garnish.trim(),
            description: form.description.trim(),
            directions: form.directions.trim()
        });
        onDone();
    }

    return (
        <form className="card edit-form" onSubmit={save}>
            <h2>Edit details</h2>
            <div className="form-grid">
                <label className="span-2">Name
                    <input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
                </label>
                <label>Type
                    <select value={form.type} onChange={(e) => set("type", e.target.value)}>
                        {TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                </label>
                <label>Menu price per serving ($)
                    <input value={form.menuPrice} inputMode="decimal" placeholder="Not sold" onChange={(e) => set("menuPrice", e.target.value)} />
                </label>
                <label>Makes
                    <input value={form.yieldAmount} inputMode="decimal" onChange={(e) => set("yieldAmount", e.target.value)} />
                </label>
                <label>Yield unit
                    <select value={form.yieldUnit} onChange={(e) => set("yieldUnit", e.target.value)}>
                        {YIELD_UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                </label>
                <label className="span-2">Makes ingredient (for preps like "Lime juice")
                    <input value={form.makes} list="ingredient-name-list" placeholder="Optional" onChange={(e) => set("makes", e.target.value)} />
                    <datalist id="ingredient-name-list">
                        {db.ingredients.map((i) => <option key={i.id} value={i.name} />)}
                    </datalist>
                </label>
                <label>Glass
                    <input value={form.glass} placeholder="Coupe" onChange={(e) => set("glass", e.target.value)} />
                </label>
                <label>Garnish
                    <input value={form.garnish} placeholder="Lime wheel" onChange={(e) => set("garnish", e.target.value)} />
                </label>
                <label className="span-2">Description (the story, for staff)
                    <textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
                </label>
                <label className="span-2">Directions
                    <textarea rows={3} value={form.directions} onChange={(e) => set("directions", e.target.value)} />
                </label>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="button-row">
                <button type="submit">Save</button>
                <button type="button" className="secondary" onClick={onDone}>Cancel</button>
            </div>
        </form>
    );
}
