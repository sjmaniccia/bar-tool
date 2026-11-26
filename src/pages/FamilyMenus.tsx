// ===== FamilyMenus.tsx =====
// Menus in a recipe book: a recipe book holds menus, a menu holds recipes.
//     Maniccia Family (recipe book)
//         Thanksgiving (menu): Grandma's Stuffing, Sarah's Pie, ...
//         Sunday dinner (menu): ...
// Who can do what (data/menus.ts, enforced in recipes-only.sql):
//     anyone        makes a menu, adds any recipe to any menu, takes off a dish they added
//     the maker     renames, reorders, deletes the menu, takes off anyone's dish
//     the owner     same as the maker, on every menu

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { addToMenu, createMenu, deleteMenu, itemsOf, moveItem, removeFromMenu, updateMenu } from "../data/menus";
import { findById } from "../data/utils";
import type { Menu } from "../data/types";
import { useMemberNames, useRecipeRights } from "../cloud/names";
import { useSession } from "../cloud/session";
import TextInput from "../components/TextInput";

// ===== All menus =====

export function FamilyMenusList() {
    const db = useDb();
    const navigate = useNavigate();
    const names = useMemberNames();
    const [name, setName] = useState("");

    function make(event: FormEvent) {
        event.preventDefault();
        if (name.trim() === "") return;
        navigate("/menus/" + createMenu(name));
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Menus</h1>
                    <p className="muted">A meal's worth of recipes, like Thanksgiving or Sunday dinner. Anyone can add a dish to any menu.</p>
                </div>
            </div>
            <form className="card menu-new" onSubmit={make}>
                <input value={name} maxLength={80} placeholder="New menu: Thanksgiving, Sunday dinner…" aria-label="New menu name" onChange={(e) => setName(e.target.value)} />
                <button type="submit" disabled={name.trim() === ""}>Make it</button>
            </form>
            {db.menus.length === 0 ? (
                <section className="card empty">No menus yet. Name one above, then add recipes to it.</section>
            ) : (
                <ul className="card recipe-plain-list">
                    {[...db.menus].sort((a, b) => a.name.localeCompare(b.name)).map((menu) => {
                        const count = itemsOf(menu.id).filter((i) => findById(db.recipes, i.recipeId)).length;
                        const by = names.get(menu.createdBy);
                        return (
                            <li key={menu.id}>
                                <Link to={"/menus/" + menu.id}>
                                    <span className="recipe-plain-name">
                                        <strong>{menu.name}</strong>
                                        {by && <span className="muted small">Made by {by}</span>}
                                    </span>
                                    <span className="muted small">{count} {count === 1 ? "dish" : "dishes"}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

// ===== One menu =====

export function FamilyMenuDetail({ menu }: { menu: Menu }) {
    const db = useDb();
    const navigate = useNavigate();
    const session = useSession();
    const names = useMemberNames();
    const { canEdit: runsIt, addedBy: madeBy } = useRecipeRights(menu);
    const [adding, setAdding] = useState("");

    const items = itemsOf(menu.id).filter((i) => findById(db.recipes, i.recipeId));
    const onMenu = new Set(items.map((i) => i.recipeId));
    const canAdd = db.recipes.filter((r) => !onMenu.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));
    const mine = (createdBy: string) => session.mode !== "ready" || createdBy === session.userId;

    function remove() {
        if (!confirm("Delete the " + menu.name + " menu? The recipes stay.")) return;
        deleteMenu(menu.id);
        navigate("/menus");
    }

    return (
        <div className="page">
            <Link to="/menus" className="back">← Menus</Link>
            <div className="page-header">
                <div>
                    <h1>{menu.name}</h1>
                    <p className="muted">
                        {[madeBy && "Made by " + madeBy, items.length + (items.length === 1 ? " dish" : " dishes")].filter(Boolean).join(" · ")}
                    </p>
                    {menu.description && <p className="muted">{menu.description}</p>}
                </div>
            </div>

            <ul className="card recipe-plain-list">
                {items.length === 0 && <li className="card-pad muted">Nothing yet. Add a recipe below.</li>}
                {items.map((item, i) => {
                    const recipe = findById(db.recipes, item.recipeId)!;
                    const broughtBy = item.createdBy && item.createdBy !== menu.createdBy ? names.get(item.createdBy) : "";
                    return (
                        <li key={item.id} className="menu-dish">
                            <Link to={"/recipes/" + recipe.id}>
                                {recipe.photo
                                    ? <img className="recipe-thumb" src={recipe.photo} alt="" loading="lazy" />
                                    : <span className="recipe-thumb empty" aria-hidden="true" />}
                                <span className="recipe-plain-name">
                                    <strong>{recipe.name}</strong>
                                    {broughtBy && <span className="muted small">Added by {broughtBy}</span>}
                                </span>
                            </Link>
                            <span className="menu-dish-actions">
                                {runsIt && (
                                    <>
                                        <button className="icon-button secondary" aria-label={"Move " + recipe.name + " up"} disabled={i === 0} onClick={() => moveItem(item.id, -1)}>↑</button>
                                        <button className="icon-button secondary" aria-label={"Move " + recipe.name + " down"} disabled={i === items.length - 1} onClick={() => moveItem(item.id, 1)}>↓</button>
                                    </>
                                )}
                                {(runsIt || mine(item.createdBy)) && (
                                    <button className="icon-button secondary" aria-label={"Take " + recipe.name + " off the menu"} onClick={() => removeFromMenu(item.id)}>✕</button>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <div className="add-line">
                <select value={adding} aria-label="Add a recipe" onChange={(e) => setAdding(e.target.value)}>
                    <option value="">Add a recipe to {menu.name}…</option>
                    {canAdd.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button className="secondary" disabled={adding === ""} onClick={() => { addToMenu(menu.id, adding); setAdding(""); }}>Add</button>
            </div>

            {runsIt && (
                <section className="card">
                    <h2>Details</h2>
                    <div className="form-grid">
                        <label className="form-field"><span>Name</span>
                            <TextInput value={menu.name} required onSave={(name) => updateMenu(menu.id, { name })} /></label>
                        <label className="form-field"><span>Note</span>
                            <TextInput value={menu.description} placeholder="When it's made, who's coming" onSave={(description) => updateMenu(menu.id, { description })} /></label>
                    </div>
                    <button className="danger" onClick={remove}>Delete menu</button>
                </section>
            )}
        </div>
    );
}
