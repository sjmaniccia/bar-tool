// ===== MenuDetail.tsx =====
// One menu: its recipes in order with price, cost %, and profit, plus averages.
// Red cost % = over that recipe type's target. "Spec book" prints every recipe for staff.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDb } from "../data/storage";
import { addToMenu, deleteMenu, menuRows, menuStats, moveItem, removeFromMenu, updateMenu } from "../data/menus";
import { findById, formatMoney, formatPercent } from "../data/utils";
import TextInput from "../components/TextInput";

export default function MenuDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { menuId } = useParams();
    const menu = findById(db.menus, menuId ?? null);
    const [adding, setAdding] = useState("");

    if (menu === null) {
        return (
            <div className="page">
                <h1>Menu not found</h1>
                <Link to="/menus">← Menus</Link>
            </div>
        );
    }

    const rows = menuRows(menu.id);
    const stats = menuStats(menu.id);
    const onMenu = new Set(rows.map((r) => r.recipe.id));
    // Anything sold can go on a menu (preps are ingredients, not menu items)
    const canAdd = db.recipes.filter((r) => r.type !== "Prep" && !onMenu.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));

    function remove() {
        if (!confirm("Delete the " + menu!.name + " menu? The recipes stay.")) return;
        deleteMenu(menu!.id);
        navigate("/menus");
    }

    return (
        <div className="page">
            <Link to="/menus" className="back">← Menus</Link>
            <div className="page-header">
                <div>
                    <h1>{menu.name}</h1>
                    {menu.description && <p className="muted">{menu.description}</p>}
                </div>
                <div className="button-row">
                    <Link className="button secondary-link" to={"/menus/" + menu.id + "/specs"}>Spec book</Link>
                    <button className="danger" onClick={remove}>Delete</button>
                </div>
            </div>

            <div className="stat-row">
                <div className="stat"><span className="stat-label">Items</span><span className="stat-value">{rows.length}</span></div>
                <div className="stat">
                    <span className="stat-label">Average cost</span>
                    <span className="stat-value">{stats.averageCostRatio === null ? "—" : formatPercent(stats.averageCostRatio)}</span>
                    <span className="stat-ratio">of menu price, incl. labor</span>
                </div>
                <div className="stat">
                    <span className="stat-label">Average profit</span>
                    <span className="stat-value">{stats.averageProfit === null ? "—" : formatMoney(stats.averageProfit)}</span>
                    <span className="stat-ratio">per item sold</span>
                </div>
            </div>

            <section className="card table-card">
                <h2>On this menu</h2>
                {rows.length === 0 ? <p className="card-pad muted">Nothing yet. Add recipes below.</p> : (
                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr><th>Order</th><th>Recipe</th><th className="num">Price</th><th className="num">Cost</th><th className="num">Ingredient %</th><th className="num">Profit</th><th></th></tr>
                            </thead>
                            <tbody>
                                {rows.map(({ item, recipe, summary }, i) => {
                                    const over = summary?.ingredientRatio != null && summary.ingredientRatio > summary.targetCost + 0.05;
                                    return (
                                        <tr key={item.id}>
                                            <td className="nowrap">
                                                <button className="icon-button secondary" aria-label="Move up" disabled={i === 0} onClick={() => moveItem(item.id, -1)}>↑</button>{" "}
                                                <button className="icon-button secondary" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => moveItem(item.id, 1)}>↓</button>
                                            </td>
                                            <td><Link to={"/recipes/" + recipe.id}>{recipe.name}</Link> <span className="tag">{recipe.type}</span></td>
                                            <td className="num">{recipe.menuPrice === null ? "—" : formatMoney(recipe.menuPrice)}</td>
                                            <td className="num">{summary === null ? "loop" : formatMoney(summary.totalCost)}</td>
                                            <td className={"num" + (over ? " warn" : "")}>{summary?.ingredientRatio != null ? formatPercent(summary.ingredientRatio) : "—"}</td>
                                            <td className="num">{summary?.profit != null ? formatMoney(summary.profit) : "—"}</td>
                                            <td className="num"><button className="danger icon-button" aria-label="Remove from menu" onClick={() => removeFromMenu(item.id)}>✕</button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="add-line card-pad">
                    <select value={adding} aria-label="Add a recipe" onChange={(e) => setAdding(e.target.value)}>
                        <option value="">Add a recipe…</option>
                        {canAdd.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <button className="secondary" disabled={adding === ""} onClick={() => { addToMenu(menu.id, adding); setAdding(""); }}>Add</button>
                </div>
            </section>

            <section className="card">
                <h2>Details</h2>
                <div className="form-grid">
                    <label className="form-field"><span>Name</span>
                        <TextInput value={menu.name} required onSave={(name) => updateMenu(menu.id, { name })} /></label>
                    <label className="form-field"><span>Description</span>
                        <TextInput value={menu.description} placeholder="Where or when it's served" onSave={(description) => updateMenu(menu.id, { description })} /></label>
                </div>
            </section>
        </div>
    );
}
