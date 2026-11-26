// ===== Groceries.tsx =====
// Grocery lists in a recipe book (data/groceries.ts does the combining):
//     /groceries          the lists I can see (shared ones and my own)
//     /groceries/new      pick recipes (or a menu) -> a new list, or add them to one
//     /groceries/:id      the list, by store section: tick things off, add more, text it

import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useDb } from "../data/storage";
import { findById } from "../data/utils";
import { itemsOf } from "../data/menus";
import { lineText, unitLabel } from "../data/lineText";
import { PURCHASE_UNITS } from "../data/units";
import {
    SECTIONS, addItem, addRecipesToList, clearChecked, createList, deleteList, itemsOn,
    listText, removeItem, updateItem, updateList, visibleLists
} from "../data/groceries";
import type { GroceryItem } from "../data/types";
import { useSession } from "../cloud/session";
import { useMemberNames } from "../cloud/names";
import { toast } from "../feedback";
import PencilIcon from "../components/PencilIcon";
import AmountInput from "../components/AmountInput";

const CART = "M3 4h2l2.4 11h10.2L20 7H6.2 M9 20a1 1 0 1 0 0-.01 M17 20a1 1 0 1 0 0-.01";
const SHARE = "M12 3v12 M7 8l5-5 5 5 M5 13v7h14v-7";
const TRASH = "M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3";

export function Icon({ d, size = 20 }: { d: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={d} />
        </svg>
    );
}
export const CART_ICON = CART;     // the cart, for "Grocery list" buttons elsewhere

// How a line reads: "3 onions", "3/4 cup butter", "Salt and pepper"
function itemText(item: GroceryItem): string {
    return lineText({ amount: item.amount, unit: item.unit === "oz (wt)" ? "oz" : item.unit, countWord: item.countWord, note: "" }, item.name);
}

// ===== All my lists =====

export function GroceryLists() {
    const db = useDb();
    const session = useSession();
    const names = useMemberNames();
    const lists = visibleLists(session.mode === "ready" ? session.userId : "");

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Grocery lists</h1>
                    <p className="muted">Pick recipes or a menu, and get one list for the store, sorted by section.</p>
                </div>
                <Link className="button" to="/groceries/new"><Icon d={CART} size={18} /> New list</Link>
            </div>
            {lists.length === 0 ? (
                <section className="card empty">No lists yet. Make one from your recipes, or from a menu like Thanksgiving.</section>
            ) : (
                <ul className="card recipe-plain-list">
                    {lists.map((list) => {
                        const items = db.groceryItems.filter((i) => i.listId === list.id);
                        const left = items.filter((i) => !i.checked).length;
                        const by = list.createdBy !== session.userId ? names.get(list.createdBy) : "";
                        return (
                            <li key={list.id}>
                                <Link to={"/groceries/" + list.id}>
                                    <span className="recipe-plain-name">
                                        <strong>{list.name}</strong>
                                        <span className="muted small">{list.shared ? "Shared" + (by ? " by " + by : "") : "Just you"}</span>
                                    </span>
                                    <span className="muted small">{left === 0 && items.length > 0 ? "All done" : left + " to get"}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

// ===== Make a list (or add to one) =====

export function NewGroceryList() {
    const db = useDb();
    const navigate = useNavigate();
    const session = useSession();
    const [params] = useSearchParams();
    const menu = findById(db.menus, params.get("menu"));
    const lists = visibleLists(session.mode === "ready" ? session.userId : "");

    // Start with the recipes asked for: ?recipes=a,b or a menu's dishes
    const [chosen, setChosen] = useState<Set<string>>(() => new Set(
        menu ? itemsOf(menu.id).map((i) => i.recipeId) : (params.get("recipes") ?? "").split(",").filter(Boolean)
    ));
    const [cookingFor, setCookingFor] = useState<number | null>(null);
    const [target, setTarget] = useState(params.get("list") ?? "new");
    const [name, setName] = useState(menu?.name ?? "");
    const [shared, setShared] = useState(true);
    const recipes = useMemo(() => [...db.recipes].sort((a, b) => a.name.localeCompare(b.name)), [db.recipes]);

    function toggle(id: string) {
        const next = new Set(chosen);
        if (next.has(id)) next.delete(id); else next.add(id);
        setChosen(next);
    }

    function make(event: FormEvent) {
        event.preventDefault();
        if (chosen.size === 0) return;
        const listId = target === "new" ? createList(name || "Groceries", shared) : target;
        addRecipesToList(listId, [...chosen], cookingFor);
        toast("Grocery list ready", { sub: chosen.size + (chosen.size === 1 ? " recipe" : " recipes") + " on it.", sound: "tick" });
        navigate("/groceries/" + listId, { replace: true });
    }

    return (
        <div className="page page-narrow">
            <Link to="/groceries" className="back">← Grocery lists</Link>
            <h1>Make a grocery list</h1>
            <form className="grocery-new" onSubmit={make}>
                <section className="card">
                    <h2>Recipes</h2>
                    <ul className="grocery-pick">
                        {recipes.map((r) => (
                            <li key={r.id}>
                                <label>
                                    <input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} />
                                    <span>{r.name}</span>
                                    {r.yieldUnit === "serving" && r.yieldAmount > 1 && <span className="muted small">serves {r.yieldAmount}</span>}
                                </label>
                            </li>
                        ))}
                        {recipes.length === 0 && <li className="muted">No recipes yet.</li>}
                    </ul>
                </section>
                <section className="card grocery-options">
                    <label className="form-field">
                        <span>Cooking for (optional)</span>
                        <AmountInput value={cookingFor} allowBlank placeholder="As written" className="qty-input" ariaLabel="Cooking for" onSave={setCookingFor} />
                        <span className="muted small">Scales each recipe from how many it serves.</span>
                    </label>
                    {lists.length > 0 && (
                        <label className="form-field">
                            <span>Put it on</span>
                            <select value={target} onChange={(e) => setTarget(e.target.value)}>
                                <option value="new">A new list</option>
                                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </label>
                    )}
                    {target === "new" && (
                        <>
                            <label className="form-field">
                                <span>List name</span>
                                <input value={name} placeholder="Groceries" maxLength={80} onChange={(e) => setName(e.target.value)} />
                            </label>
                            {session.mode === "ready" && (
                                <label className="menu-toggle costing-toggle">
                                    <span><strong>Share it with {session.bar?.name}</strong><span className="muted small">Everyone can see it and tick things off. Off: only you see it.</span></span>
                                    <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
                                </label>
                            )}
                        </>
                    )}
                </section>
                <button type="submit" disabled={chosen.size === 0}>
                    <Icon d={CART} size={18} /> Make the list{chosen.size > 0 ? " (" + chosen.size + (chosen.size === 1 ? " recipe)" : " recipes)") : ""}
                </button>
            </form>
        </div>
    );
}

// ===== One list =====

export function GroceryListPage() {
    const db = useDb();
    const { id } = useParams();
    const navigate = useNavigate();
    const session = useSession();
    const names = useMemberNames();
    const list = findById(db.groceryLists, id ?? null);
    const [adding, setAdding] = useState("");
    const [open, setOpen] = useState<string | null>(null);

    if (list === null) {
        return <div className="page"><h1>List not found</h1><Link to="/groceries">← Grocery lists</Link></div>;
    }
    const mine = session.mode !== "ready" || list.createdBy === session.userId || session.bar?.role === "owner";
    const items = itemsOn(list.id);
    const toGet = items.filter((i) => !i.checked);
    const inCart = items.filter((i) => i.checked);
    const by = list.createdBy !== session.userId ? names.get(list.createdBy) : "";

    function add(event: FormEvent) {
        event.preventDefault();
        addItem(list!.id, adding);
        setAdding("");
    }

    async function share() {
        const text = listText(list!, itemText);
        if (navigator.share) {
            try { await navigator.share({ title: list!.name, text }); } catch { /* closed it */ }
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            toast("List copied", { sub: "Paste it into Messages or Notes." });
        } catch {
            prompt("Copy the list:", text);
        }
    }

    function remove() {
        if (!confirm("Delete the " + list!.name + " list?")) return;
        deleteList(list!.id);
        navigate("/groceries");
    }

    const row = (item: GroceryItem) => (
        <li key={item.id} className={"grocery-item" + (item.checked ? " checked" : "")}>
            <div className="grocery-row">
                <label className="grocery-check">
                    <input type="checkbox" checked={item.checked} onChange={(e) => updateItem(item.id, { checked: e.target.checked })} />
                    <span>
                        <span className="grocery-text">{itemText(item)}</span>
                        {item.forRecipes && <span className="muted small grocery-for">{item.forRecipes}</span>}
                    </span>
                </label>
                <button className="pencil" aria-label={"Edit " + item.name} aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}><PencilIcon /></button>
            </div>
            {open === item.id && (
                <div className="line-editor">
                    <label><span className="small muted">Amount</span>
                        <AmountInput value={item.amount} allowBlank placeholder="—" className="qty-input" ariaLabel="Amount"
                            onSave={(amount) => updateItem(item.id, { amount, unit: amount === null ? "" : item.unit || "each" })} /></label>
                    <label><span className="small muted">Unit</span>
                        <select value={item.unit} aria-label="Unit" onChange={(e) => updateItem(item.id, { unit: e.target.value })}>
                            <option value="">—</option>
                            {PURCHASE_UNITS.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                        </select></label>
                    <label className="line-editor-wide"><span className="small muted">Name</span>
                        <input defaultValue={item.name} onBlur={(e) => e.target.value.trim() && updateItem(item.id, { name: e.target.value.trim() })} /></label>
                    <label className="line-editor-wide"><span className="small muted">Section</span>
                        <select value={item.section} aria-label="Section" onChange={(e) => updateItem(item.id, { section: e.target.value })}>
                            {SECTIONS.map((s) => <option key={s}>{s}</option>)}
                        </select></label>
                    <div className="line-editor-actions line-editor-wide">
                        <button type="button" className="link-button danger-link" onClick={() => removeItem(item.id)}>Remove</button>
                        <button type="button" onClick={() => setOpen(null)}>Done</button>
                    </div>
                </div>
            )}
        </li>
    );

    return (
        <div className="page grocery-page">
            <div className="family-top">
                <Link to="/groceries" className="back">← Grocery lists</Link>
                <button className="icon-button plain" aria-label="Send the list" title="Send the list" onClick={() => void share()}><Icon d={SHARE} /></button>
            </div>
            <div>
                <h1>{list.name}</h1>
                <p className="muted">
                    {toGet.length} to get{inCart.length > 0 ? " · " + inCart.length + " in the cart" : ""}
                    {" · "}{list.shared ? "Shared" + (by ? " by " + by : "") : "Just you"}
                </p>
            </div>

            {SECTIONS.map((section) => {
                const here = toGet.filter((i) => i.section === section);
                if (here.length === 0) return null;
                return (
                    <section key={section} className="card grocery-section">
                        <h2>{section}</h2>
                        <ul>{here.map(row)}</ul>
                    </section>
                );
            })}
            {toGet.length === 0 && <section className="card empty">{items.length === 0 ? "Nothing on it yet." : "Everything's in the cart."}</section>}

            <form className="card grocery-add" onSubmit={add}>
                <input value={adding} placeholder="Add something: paper towels, 2 lemons…" aria-label="Add to the list" onChange={(e) => setAdding(e.target.value)} />
                <button type="submit" className="secondary" disabled={adding.trim() === ""}>Add</button>
            </form>
            <Link className="link-button small" to={"/groceries/new?list=" + list.id}>+ Add recipes to this list</Link>

            {inCart.length > 0 && (
                <section className="card grocery-section in-cart">
                    <h2>In the cart</h2>
                    <ul>{inCart.map(row)}</ul>
                    <button className="link-button small" onClick={() => clearChecked(list.id)}>Clear them off the list</button>
                </section>
            )}

            {mine && (
                <div className="grocery-foot">
                    {session.mode === "ready" && (
                        <label className="menu-toggle costing-toggle">
                            <span><strong>Share with {session.bar?.name}</strong><span className="muted small">{list.shared ? "Everyone in it can see this list." : "Only you can see this list."}</span></span>
                            <input type="checkbox" checked={list.shared} onChange={(e) => updateList(list.id, { shared: e.target.checked })} />
                        </label>
                    )}
                    <button className="link-button danger-link family-delete" onClick={remove}><Icon d={TRASH} size={16} /> Delete list</button>
                </div>
            )}
        </div>
    );
}
