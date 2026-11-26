// ===== RecipeLines.tsx =====
// The ingredients on a "Just recipes" recipe page, read like a recipe card:
//     2 onions, chopped                          ✎
//     3 cloves garlic, minced                    ✎
//     Salt and pepper to taste                   ✎
//     + Add an ingredient
// A pencil opens just that line (amount, unit, of what, name, note). One open at a time.
// readOnly: no pencils or adding (someone else's recipe: make your own version instead).
// Behind the scenes each line is still a normal recipe line with an ingredient,
// so turning costing on later works without redoing anything.

import { useState } from "react";
import type { Recipe, RecipeLine } from "../../data/types";
import { db } from "../../data/storage";
import { findById, parseAmount } from "../../data/utils";
import { PURCHASE_UNITS } from "../../data/units";
import { addLine, getOrCreateIngredient, removeLine, updateLine } from "../../data/actions";
import { lineText, unitLabel } from "../../data/lineText";
import AmountInput from "../AmountInput";
import PencilIcon from "../PencilIcon";

// The name a line shows: its ingredient, or the sub-recipe it uses
function nameOf(line: RecipeLine): string {
    return findById(db.ingredients, line.ingredientId)?.name ?? findById(db.recipes, line.subRecipeId)?.name ?? "";
}

export default function RecipeLines({ recipe, lines, readOnly = false }: { recipe: Recipe; lines: RecipeLine[]; readOnly?: boolean }) {
    const [open, setOpen] = useState<string | null>(null);     // the open line's id, "new" for the add form

    return (
        <section className="card recipe-lines-card">
            <h2>Ingredients</h2>
            <ul className="recipe-scan-lines">
                {lines.map((line) => (
                    <LineItem key={line.id} line={line} open={open === line.id} readOnly={readOnly}
                        onToggle={() => setOpen(open === line.id ? null : line.id)} />
                ))}
                {lines.length === 0 && <li className="muted small recipe-scan-line-row">No ingredients yet.</li>}
            </ul>
            {readOnly ? null : open === "new"
                ? <AddLine recipe={recipe} onDone={() => setOpen(null)} />
                : <button type="button" className="link-button small no-print" onClick={() => setOpen("new")}>+ Add an ingredient</button>}
        </section>
    );
}

// One line: its text and a pencil, or the editor when open
function LineItem({ line, open, readOnly, onToggle }: { line: RecipeLine; open: boolean; readOnly: boolean; onToggle: () => void }) {
    const name = nameOf(line);
    const amount = line.amount > 0 ? line.amount : null;
    const shown = { amount, unit: line.unit, countWord: line.countWord, note: line.note };

    // Rename: point the line at that ingredient (made if new); sub-recipe lines keep their name
    function rename(value: string) {
        if (line.subRecipeId !== null || value.trim() === "" || value.trim() === name) return;
        updateLine(line.id, { ingredientId: getOrCreateIngredient(value).id });
    }

    return (
        <li className={"recipe-scan-line" + (open ? " open" : "")}>
            <div className="recipe-scan-line-row">
                <span className="recipe-scan-line-text">{lineText(shown, name || "?")}</span>
                {!readOnly && <button type="button" className="pencil no-print" aria-label={"Edit " + name} aria-expanded={open} onClick={onToggle}><PencilIcon /></button>}
            </div>
            {open && !readOnly && (
                <div className="line-editor no-print">
                    <label><span className="small muted">Amount</span>
                        <AmountInput value={amount} allowBlank placeholder="—" className="qty-input" ariaLabel="Amount"
                            onSave={(v) => updateLine(line.id, v === null ? { amount: 0, unit: "", countWord: "" } : { amount: v, unit: line.unit || "each" })} /></label>
                    <label><span className="small muted">Unit</span>
                        <select value={line.unit} aria-label="Unit" onChange={(e) => updateLine(line.id, { unit: e.target.value, countWord: e.target.value === "each" ? line.countWord : "" })}>
                            <option value="">—</option>
                            {PURCHASE_UNITS.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                        </select></label>
                    {line.unit === "each" && (
                        <label><span className="small muted">Of what (optional)</span>
                            <input defaultValue={line.countWord} placeholder="clove, can, stick"
                                onBlur={(e) => updateLine(line.id, { countWord: e.target.value.trim().toLowerCase() })} /></label>
                    )}
                    <label className="line-editor-wide"><span className="small muted">Ingredient</span>
                        <input defaultValue={name} disabled={line.subRecipeId !== null} onBlur={(e) => rename(e.target.value)} /></label>
                    <label className="line-editor-wide"><span className="small muted">Note</span>
                        <input defaultValue={line.note} placeholder="chopped, to taste" onBlur={(e) => updateLine(line.id, { note: e.target.value.trim() })} /></label>
                    <div className="line-editor-actions line-editor-wide">
                        <button type="button" className="link-button danger-link" onClick={() => removeLine(line.id)}>Remove</button>
                        <button type="button" onClick={onToggle}>Done</button>
                    </div>
                </div>
            )}
        </li>
    );
}

// Add a line: amount (optional), unit, name, note
function AddLine({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
    const [amountText, setAmountText] = useState("");          // "2", "1 1/2", or blank for "to taste"
    const [unit, setUnit] = useState("each");
    const [name, setName] = useState("");
    const [note, setNote] = useState("");

    // Add it, then keep the form open for the next one
    //     IF the same ingredient is already in the recipe, addLine updates that line instead
    const [error, setError] = useState("");
    function add() {
        if (name.trim() === "") return;
        const amount = amountText.trim() === "" ? null : parseAmount(amountText);
        if (amount !== null && (isNaN(amount) || amount <= 0)) return setError("Enter an amount like 2, 3/4 or 1 1/2, or leave it blank.");
        const ingredient = getOrCreateIngredient(name);
        addLine(recipe.id, ingredient.id, null, amount ?? 0, amount === null ? "" : unit);
        const added = db.recipeLines.find((l) => l.recipeId === recipe.id && l.ingredientId === ingredient.id);
        if (added) updateLine(added.id, { note: note.trim(), countWord: "" });
        setError("");
        setAmountText("");
        setName("");
        setNote("");
    }

    return (
        <form className="line-editor" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <label><span className="small muted">Amount</span>
                <input className="qty-input" value={amountText} placeholder="—" inputMode="decimal" autoFocus aria-label="New amount" onChange={(e) => setAmountText(e.target.value)} /></label>
            <label><span className="small muted">Unit</span>
                <select value={unit} aria-label="New unit" onChange={(e) => setUnit(e.target.value)}>
                    {PURCHASE_UNITS.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                </select></label>
            <label className="line-editor-wide"><span className="small muted">Ingredient</span>
                <input value={name} placeholder="Onion" aria-label="New ingredient" onChange={(e) => setName(e.target.value)} /></label>
            <label className="line-editor-wide"><span className="small muted">Note</span>
                <input value={note} placeholder="chopped, to taste" onChange={(e) => setNote(e.target.value)} /></label>
            {error && <p className="error line-editor-wide">{error}</p>}
            <div className="line-editor-actions line-editor-wide">
                <button type="button" className="link-button" onClick={onDone}>Close</button>
                <button type="submit" disabled={name.trim() === ""}>Add</button>
            </div>
        </form>
    );
}
