// ===== MenuDetail.tsx =====
// One menu: its recipes in order, one line each (price · cost %), with the averages on top.
// The name and note are edited where they sit; a line's pencil moves it or takes it off.
// Red cost % = over that recipe type's target. The page icon (top right) is the spec sheet.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDb } from "../data/storage";
import { addToMenu, deleteMenu, menuRows, menuStats, moveItem, removeFromMenu, updateMenu } from "../data/menus";
import { findById, formatMoney, formatPercent } from "../data/utils";
import TextInput from "../components/TextInput";
import EditableTitle from "../components/EditableTitle";
import PencilIcon from "../components/PencilIcon";
import { useRecipesOnly } from "../data/place";
import { FamilyMenuDetail } from "./FamilyMenus";

export default function MenuDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { menuId } = useParams();
    const menu = findById(db.menus, menuId ?? null);
    const [adding, setAdding] = useState("");
    const [open, setOpen] = useState<string | null>(null);      // the one line being edited
    const recipesOnly = useRecipesOnly();

    if (menu === null) {
        return (
            <div className="page">
                <h1>Menu not found</h1>
                <Link to="/menus">← Menus</Link>
            </div>
        );
    }
    if (recipesOnly) return <FamilyMenuDetail menu={menu} />;

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
        <div className="page menu-page">
            <div className="family-top">
                <Link to="/menus" className="back">← Menus</Link>
                <Link className="icon-button plain" to={"/menus/" + menu.id + "/specs"} aria-label="Spec sheet" title="Spec sheet">
                    <Icon d="M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7" />
                </Link>
            </div>
            <div>
                <EditableTitle value={menu.name} label="Menu name" onSave={(name) => updateMenu(menu.id, { name })} />
                <TextInput className="menu-note-input" value={menu.description} placeholder="+ Add a note: where or when it's served"
                    ariaLabel="Menu note" onSave={(description) => updateMenu(menu.id, { description })} />
            </div>

            {/* The numbers that matter, in one row */}
            <div className="menu-stats">
                <span><strong>{rows.length}</strong> {rows.length === 1 ? "item" : "items"}</span>
                <span><strong>{stats.averageCostRatio === null ? "—" : formatPercent(stats.averageCostRatio)}</strong> avg cost</span>
                <span><strong>{stats.averageProfit === null ? "—" : formatMoney(stats.averageProfit)}</strong> avg profit</span>
            </div>

            {/* One line per drink: name, price, cost %; the pencil moves it or takes it off */}
            <ul className="card menu-lines">
                {rows.length === 0 && <li className="menu-line-empty muted">Nothing yet. Add a recipe below.</li>}
                {rows.map(({ item, recipe, summary }, i) => {
                    const over = summary?.ingredientRatio != null && summary.ingredientRatio > summary.targetCost + 0.05;
                    const isOpen = open === item.id;
                    return (
                        <li key={item.id} className={"menu-line" + (isOpen ? " open" : "")}>
                            <div className="menu-line-row">
                                <Link to={"/recipes/" + recipe.id} className="menu-line-name">
                                    {recipe.photo
                                        ? <img className="menu-line-thumb" src={recipe.photo} alt="" loading="lazy" />
                                        : <span className="menu-line-thumb" style={{ background: TINTS[recipe.type] }} aria-hidden="true">{recipe.name.charAt(0)}</span>}
                                    <strong>{recipe.name}</strong>
                                </Link>
                                <span className="menu-line-nums">
                                    {recipe.menuPrice === null ? <span className="muted">no price</span> : formatMoney(recipe.menuPrice)}
                                    {summary?.ingredientRatio != null && <span className={over ? "warn" : "muted"}> · {formatPercent(summary.ingredientRatio)}</span>}
                                </span>
                                <button type="button" className="pencil" aria-label={"Edit " + recipe.name + " on this menu"} aria-expanded={isOpen}
                                    onClick={() => setOpen(isOpen ? null : item.id)}><PencilIcon /></button>
                            </div>
                            {isOpen && (
                                <div className="line-editor menu-line-editor">
                                    <span className="muted small line-editor-wide">
                                        Costs {summary === null ? "—" : formatMoney(summary.totalCost)}
                                        {summary?.profit != null ? " · " + formatMoney(summary.profit) + " profit each" : ""}
                                        {over ? " · over the " + formatPercent(summary!.targetCost) + " target" : ""}
                                    </span>
                                    <div className="line-editor-actions line-editor-wide">
                                        <span className="button-row">
                                            <button type="button" className="secondary icon-button" aria-label="Move up" disabled={i === 0} onClick={() => moveItem(item.id, -1)}>↑</button>
                                            <button type="button" className="secondary icon-button" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => moveItem(item.id, 1)}>↓</button>
                                        </span>
                                        <button type="button" className="link-button danger-link" onClick={() => { removeFromMenu(item.id); setOpen(null); }}>Take off the menu</button>
                                        <button type="button" onClick={() => setOpen(null)}>Done</button>
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
                <li className="add-line menu-add">
                    <select value={adding} aria-label="Add a recipe" onChange={(e) => setAdding(e.target.value)}>
                        <option value="">+ Add a recipe…</option>
                        {canAdd.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <button className="secondary" disabled={adding === ""} onClick={() => { addToMenu(menu.id, adding); setAdding(""); }}>Add</button>
                </li>
            </ul>

            <button className="link-button danger-link family-delete" onClick={remove}><Icon d="M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3" size={16} /> Delete menu</button>
        </div>
    );
}

const TINTS: Record<string, string> = { Cocktail: "#f3ead8", Dish: "#efe6da", Beer: "#f3f1dc", Prep: "#e6efe9" };

function Icon({ d, size = 20 }: { d: string; size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
