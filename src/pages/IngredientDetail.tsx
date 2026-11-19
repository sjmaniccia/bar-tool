// ===== IngredientDetail.tsx =====
// One ingredient:
//     sources       every product you can buy for it and every prep that makes it,
//                   with its cost; pick the house choice here
//     conversions   e.g. 1 each (lime) = 1 fl oz of juice, for units that can't convert on their own
//     used in       the recipes that call for it

import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDb } from "../data/storage";
import {
    addConversion, deleteIngredient, ingredientCost, recipesUsingIngredient, removeConversion,
    safeCost, setHouseSource, updateIngredient
} from "../data/library";
import { houseSource, productOf, sourceKey, sourceName, sourceUnit, sourcesFor } from "../data/costing";
import { PURCHASE_UNITS, displayUnitFor } from "../data/units";
import { findById, formatAmount, formatMoney, parseAmount } from "../data/utils";
import TextInput from "../components/TextInput";

export default function IngredientDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { ingredientId } = useParams();
    const ingredient = findById(db.ingredients, ingredientId ?? null);

    if (ingredient === null) {
        return (
            <div className="page">
                <h1>Ingredient not found</h1>
                <Link to="/ingredients">← Ingredients</Link>
            </div>
        );
    }

    const sources = sourcesFor(ingredient.id);
    const house = houseSource(ingredient);
    const best = ingredientCost(ingredient);
    const usedIn = recipesUsingIngredient(ingredient.id);
    const conversions = db.ingredientConversions.filter((c) => c.ingredientId === ingredient.id);
    // Show every source's cost in the same unit so they can be compared
    const compareUnit = best?.unit ?? (sources[0] ? displayUnitFor(sourceUnit(sources[0])) : "");

    function remove() {
        if (!confirm("Delete " + ingredient!.name + "?")) return;
        if (deleteIngredient(ingredient!.id)) navigate("/ingredients");
        else alert("A recipe uses or makes " + ingredient!.name + ". Change that recipe first.");
    }

    return (
        <div className="page">
            <Link to="/ingredients" className="back">← Ingredients</Link>
            <div className="page-header">
                <div>
                    <h1>{ingredient.name}</h1>
                    <div className="tags">
                        {best && <span className="tag house">{formatMoney(best.cost)} / {best.unit}</span>}
                        <span className="tag">{sources.length} {sources.length === 1 ? "source" : "sources"}</span>
                    </div>
                </div>
                <button className="danger" onClick={remove}>Delete</button>
            </div>

            <section className="card">
                <h2>Name</h2>
                <TextInput value={ingredient.name} required onSave={(name) => updateIngredient(ingredient.id, { name })} />
                <p className="muted small">Renaming changes it in every recipe that uses it.</p>
            </section>

            <section className="card table-card">
                <h2>Where it comes from</h2>
                {sources.length === 0 ? (
                    <p className="card-pad muted">
                        Nothing yet. Open a product on <Link to="/products">Products</Link> and set "Counts as ingredient" to {ingredient.name},
                        or have a prep recipe make it.
                    </p>
                ) : (
                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>House</th>
                                    <th>Source</th>
                                    <th className="num">Cost / {compareUnit}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* No house choice: recipes use the cheapest source */}
                                <tr>
                                    <td><input type="radio" name="house" aria-label="No house choice" checked={house === null}
                                        onChange={() => setHouseSource(ingredient.id, "")} /></td>
                                    <td className="muted">No house choice, use the cheapest</td>
                                    <td></td>
                                </tr>
                                {sources.map((source) => {
                                    const cost = safeCost(source, compareUnit, ingredient.id);
                                    const key = sourceKey(source);
                                    const product = source.kind === "unit" ? productOf(source.unit) : null;
                                    return (
                                        <tr key={key}>
                                            <td><input type="radio" name="house" aria-label={"House: " + sourceName(source)}
                                                checked={house !== null && sourceKey(house) === key}
                                                onChange={() => setHouseSource(ingredient.id, key)} /></td>
                                            <td>
                                                {source.kind === "unit"
                                                    ? <Link to={"/products/" + product?.id}>{sourceName(source)}</Link>
                                                    : <Link to={"/recipes/" + source.recipe.id}>{sourceName(source)}</Link>}
                                                {best && !best.isHouse && sourceKey(best.source) === key && <span className="tag">cheapest</span>}
                                            </td>
                                            <td className="num">{cost === null ? <span className="muted">can't convert</span> : formatMoney(cost)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <div className="card-grid">
                <section className="card">
                    <h2>Conversions</h2>
                    <p className="muted small">
                        For units that can't convert on their own. A recipe says "1 fl oz lime juice" but you buy limes by the each?
                        Add 1 each = 1 fl oz.
                    </p>
                    {conversions.length > 0 && (
                        <ul className="plain-list">
                            {conversions.map((c) => (
                                <li key={c.id}>
                                    {formatAmount(c.fromAmount)} {c.fromUnit} = {formatAmount(c.toAmount)} {c.toUnit}
                                    <button className="link-button" onClick={() => removeConversion(c.id)}>remove</button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <ConversionForm ingredientId={ingredient.id} />
                </section>

                <section className="card">
                    <h2>Used in</h2>
                    {usedIn.length === 0 ? <p className="muted">No recipes use it yet.</p> : (
                        <ul className="plain-list">
                            {usedIn.map((r) => <li key={r.id}><Link to={"/recipes/" + r.id}>{r.name}</Link> <span className="tag">{r.type}</span></li>)}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
}


// Add "1 each = 0.25 lb"
function ConversionForm({ ingredientId }: { ingredientId: string }) {
    const [form, setForm] = useState({ fromAmount: "1", fromUnit: "each", toAmount: "", toUnit: "fl oz" });
    const [error, setError] = useState("");

    // CHECK both amounts are numbers above 0 and the units differ, then add it
    function submit(event: FormEvent) {
        event.preventDefault();
        const from = parseAmount(form.fromAmount);
        const to = parseAmount(form.toAmount);
        if (isNaN(from) || from <= 0 || isNaN(to) || to <= 0) return setError("Enter both amounts, like 1 = 0.25.");
        if (form.fromUnit === form.toUnit) return setError("Pick two different units.");
        addConversion(ingredientId, from, form.fromUnit, to, form.toUnit);
        setForm({ ...form, toAmount: "" });
        setError("");
    }

    return (
        <form className="add-line" onSubmit={submit}>
            <input className="qty-input" value={form.fromAmount} aria-label="From amount" onChange={(e) => setForm({ ...form, fromAmount: e.target.value })} />
            <select value={form.fromUnit} aria-label="From unit" onChange={(e) => setForm({ ...form, fromUnit: e.target.value })}>
                {PURCHASE_UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
            <span>=</span>
            <input className="qty-input" value={form.toAmount} placeholder="0.25" aria-label="To amount" onChange={(e) => setForm({ ...form, toAmount: e.target.value })} />
            <select value={form.toUnit} aria-label="To unit" onChange={(e) => setForm({ ...form, toUnit: e.target.value })}>
                {PURCHASE_UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
            <button type="submit" className="secondary">Add</button>
            {error && <p className="error">{error}</p>}
        </form>
    );
}
