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
import EditableTitle from "../components/EditableTitle";
import PencilIcon from "../components/PencilIcon";
import { CART_ICON, Icon } from "./Groceries";
import { MenuPeek } from "./MenusList";

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
        <div className="page menu-page tile-page">
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
                <ul className="card menu-lines">
                    {[...db.menus].sort((a, b) => a.name.localeCompare(b.name)).map((menu) => {
                        const dishes = itemsOf(menu.id).map((i) => findById(db.recipes, i.recipeId)).filter((r) => r !== null);
                        const by = names.get(menu.createdBy);
                        return (
                            <li key={menu.id} className="menu-line">
                                <Link to={"/menus/" + menu.id} className="menu-line-row menu-list-row">
                                    <MenuPeek name={menu.name} />
                                    <span className="menu-list-name">
                                        <strong>{menu.name}</strong>
                                        <span className="muted small">{dishes.length} {dishes.length === 1 ? "dish" : "dishes"}{by ? " · by " + by : ""}</span>
                                    </span>
                                    <span className="chevron" aria-hidden="true">›</span>
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
    const [open, setOpen] = useState<string | null>(null);      // the one line being edited

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
        <div className="page menu-page">
            <div className="family-top">
                <Link to="/menus" className="back">← Menus</Link>
                {items.length > 0 && (
                    <Link className="icon-button plain" to={"/groceries/new?menu=" + menu.id} aria-label="Grocery list" title="Grocery list"><Icon d={CART_ICON} /></Link>
                )}
            </div>
            <div>
                <EditableTitle value={menu.name} label="Menu name" readOnly={!runsIt} onSave={(name) => updateMenu(menu.id, { name })} />
                {runsIt ? (
                    <TextInput className="menu-note-input" value={menu.description} placeholder="+ Add a note: when it's made, who's coming"
                        ariaLabel="Menu note" onSave={(description) => updateMenu(menu.id, { description })} />
                ) : menu.description && <p className="muted">{menu.description}</p>}
            </div>
            <div className="menu-stats">
                <span><strong>{items.length}</strong> {items.length === 1 ? "dish" : "dishes"}</span>
                {madeBy && <span>Made by <strong>{madeBy}</strong></span>}
            </div>

            {/* One line per dish; the pencil moves it or takes it off (if it's yours to change) */}
            <ul className="card menu-lines">
                {items.length === 0 && <li className="menu-line-empty muted">Nothing yet. Add a recipe below.</li>}
                {items.map((item, i) => {
                    const recipe = findById(db.recipes, item.recipeId)!;
                    const broughtBy = item.createdBy && item.createdBy !== menu.createdBy ? names.get(item.createdBy) : "";
                    const canTakeOff = runsIt || mine(item.createdBy);
                    const isOpen = open === item.id;
                    return (
                        <li key={item.id} className={"menu-line" + (isOpen ? " open" : "")}>
                            <div className="menu-line-row">
                                <Link to={"/recipes/" + recipe.id} className="menu-line-name">
                                    {recipe.photo
                                        ? <img className="menu-line-thumb" src={recipe.photo} alt="" loading="lazy" />
                                        : <span className="menu-line-thumb" style={{ background: "#efe6da" }} aria-hidden="true">{recipe.name.charAt(0)}</span>}
                                    <strong>{recipe.name}</strong>
                                </Link>
                                {broughtBy && <span className="menu-line-nums muted">{broughtBy}</span>}
                                {(runsIt || canTakeOff) && (
                                    <button type="button" className="pencil" aria-label={"Edit " + recipe.name + " on this menu"} aria-expanded={isOpen}
                                        onClick={() => setOpen(isOpen ? null : item.id)}><PencilIcon /></button>
                                )}
                            </div>
                            {isOpen && (
                                <div className="line-editor menu-line-editor">
                                    <div className="line-editor-actions line-editor-wide">
                                        {runsIt && (
                                            <span className="button-row">
                                                <button type="button" className="secondary icon-button" aria-label="Move up" disabled={i === 0} onClick={() => moveItem(item.id, -1)}>↑</button>
                                                <button type="button" className="secondary icon-button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => moveItem(item.id, 1)}>↓</button>
                                            </span>
                                        )}
                                        {canTakeOff && <button type="button" className="link-button danger-link" onClick={() => { removeFromMenu(item.id); setOpen(null); }}>Take off the menu</button>}
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

            {runsIt && (
                <button className="link-button danger-link family-delete" onClick={remove}><Icon d="M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3" size={16} /> Delete menu</button>
            )}
        </div>
    );
}
