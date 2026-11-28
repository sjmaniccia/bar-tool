// ===== RecipesList.tsx =====
// All recipes: a grid of tiles, or a table with costs. Search, sort, scan and new are icons up top.
// A "Just recipes" place: a plain list instead (picture, name, serves), A to Z, no costs.
//     Cart icon -> tick recipes -> "Grocery list" makes one list from them (Groceries.tsx)
// Shown as a grid of small tiles (3 across on a phone, cost % on each); bars can switch to
// the detailed table with the list icon.

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { summarize, type RecipeSummary } from "../data/costing";
import { createRecipe, deleteRecipe, linesUsingRecipe } from "../data/actions";
import { addToMenu, createMenu } from "../data/menus";
import { useSession } from "../cloud/session";
import { toast } from "../feedback";
import Sheet from "../components/Sheet";
import { findById, formatFraction, formatMoney, formatPercent } from "../data/utils";
import { useRecipesOnly } from "../data/place";
import { useMemberNames } from "../cloud/names";
import { CART_ICON, Icon } from "./Groceries";
import { MiniGrid, MiniTile } from "../components/MiniGrid";
import { MenuPeek } from "./MenusList";
import type { Recipe } from "../data/types";

const TINTS: Record<Recipe["type"], string> = { Cocktail: "#f3ead8", Dish: "#efe6da", Beer: "#f3f1dc", Prep: "#e6efe9" };

type SortKey = "name" | "type" | "cost" | "ingredientRatio" | "profit";

const SORTS: { key: SortKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "cost", label: "Cost, low to high" },
    { key: "ingredientRatio", label: "Cost %, high to low" },
    { key: "profit", label: "Profit, high to low" }
];

const SEARCH_ICON = "M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M15.5 15.5l5 5";
const SORT_ICON = "M7 4v16 M3 8l4-4 4 4 M17 20V4 M13 16l4 4 4-4";
const LIST_ICON = "M4 6h16 M4 12h16 M4 18h16";
const GRID_ICON = "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z";
const SELECT_ICON = "M9 11.5l2.2 2.2L15.5 9.5 M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18";
const MENU_ICON = "M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4";
const TRASH_ICON = "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6";
const CAMERA_ICON = "M4 8h3l2-3h6l2 3h3v11H4z M12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7";

// Work out a recipe's summary without crashing the whole list if one has a loop
function safeSummary(recipe: Recipe): RecipeSummary | null {
    try {
        return summarize(recipe);
    } catch {
        return null;
    }
}

export default function RecipesList() {
    const db = useDb();
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [searching, setSearching] = useState(false);
    const [sort, setSortKey] = useState<SortKey>("name");
    const recipesOnly = useRecipesOnly();
    const names = useMemberNames();
    // Grid (default) or the detailed table, remembered on this device
    const [view, setViewState] = useState<"grid" | "list">(() => {
        try { return localStorage.getItem("agave.recipeView") === "list" ? "list" : "grid"; } catch { return "grid"; }
    });
    const setView = (v: "grid" | "list") => { setViewState(v); try { localStorage.setItem("agave.recipeView", v); } catch { /* private mode */ } };
    const [picked, setPicked] = useState<Set<string> | null>(null);     // null = not selecting
    const togglePick = (id: string) => {
        const next = new Set(picked);
        if (next.has(id)) next.delete(id); else next.add(id);
        setPicked(next);
    };
    const sortKey: SortKey = recipesOnly ? "name" : sort;
    const [menuSheet, setMenuSheet] = useState(false);
    const session = useSession();

    // Delete the picked recipes
    //     skip ones another recipe uses (a prep, say), and in a recipe book, ones someone else added
    function removePicked() {
        if (!picked || picked.size === 0) return;
        const all = [...picked].map((id) => findById(db.recipes, id)).filter((r) => r !== null);
        const mayDelete = (r: Recipe) => !recipesOnly || session.mode !== "ready" || session.bar?.role === "owner" || r.createdBy === session.userId;
        const used = all.filter((r) => linesUsingRecipe(r.id) > 0);
        const notMine = all.filter((r) => !mayDelete(r));
        const going = all.filter((r) => !used.includes(r) && !notMine.includes(r));
        const notes = [
            used.length > 0 ? "Kept (other recipes use them): " + used.map((r) => r.name).join(", ") : "",
            notMine.length > 0 ? "Kept (someone else added them): " + notMine.map((r) => r.name).join(", ") : ""
        ].filter(Boolean).join("\n");
        if (going.length === 0) return alert(notes);
        if (!confirm("Delete " + (going.length === 1 ? going[0].name : going.length + " recipes") + "? This can't be undone." + (notes ? "\n\n" + notes : ""))) return;
        for (const r of going) deleteRecipe(r.id);
        toast("Deleted " + (going.length === 1 ? going[0].name : going.length + " recipes"));
        setPicked(null);
    }

    // Each recipe with its summary, filtered by the search box
    const rows = db.recipes
        .filter((recipe) => recipe.name.toLowerCase().includes(search.trim().toLowerCase()))
        .map((recipe) => ({ recipe, summary: recipesOnly ? null : safeSummary(recipe) }));

    // Sort by the chosen column (blank values sort last)
    rows.sort((a, b) => {
        switch (sortKey) {
            case "name": return a.recipe.name.localeCompare(b.recipe.name);
            case "type": return a.recipe.type.localeCompare(b.recipe.type) || a.recipe.name.localeCompare(b.recipe.name);
            case "cost": return (a.summary?.totalCost ?? Infinity) - (b.summary?.totalCost ?? Infinity);
            case "ingredientRatio": return (b.summary?.ingredientRatio ?? -1) - (a.summary?.ingredientRatio ?? -1);
            case "profit": return (b.summary?.profit ?? -Infinity) - (a.summary?.profit ?? -Infinity);
        }
    });

    // Create a recipe and open it with the details form ready
    function newRecipe() {
        const id = createRecipe("New recipe");
        navigate("/recipes/" + id + "?edit=1");
    }

    return (
        <div className="page tile-page">
            {/* One row: the title (or the search box), then icons. Words only where they're needed. */}
            <div className="page-header icon-header">
                {searching || search !== "" ? (
                    <label className="search-box">
                        <Icon d={SEARCH_ICON} size={18} />
                        <input type="search" aria-label="Search recipes" placeholder="Search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                            onBlur={() => search === "" && setSearching(false)} />
                    </label>
                ) : (
                    <h1>Recipes</h1>
                )}
                <div className="icon-bar">
                    {searching || search !== ""
                        ? <button className="icon-circle" aria-label="Close search" title="Close search" onClick={() => { setSearch(""); setSearching(false); }}>×</button>
                        : <button className="icon-circle" aria-label="Search" title="Search" onClick={() => setSearching(true)}><Icon d={SEARCH_ICON} size={18} /></button>}
                    {!recipesOnly && <ViewMenu sort={sortKey} onSort={setSortKey} view={view} onView={setView} />}
                    {db.recipes.length > 0 && (
                        <button className={"icon-circle" + (picked ? " on" : "")} aria-pressed={picked !== null} aria-label={picked ? "Done picking" : "Pick recipes"} title={picked ? "Done" : "Pick"}
                            onClick={() => setPicked(picked ? null : new Set())}><Icon d={SELECT_ICON} size={18} /></button>
                    )}
                    <Link className="icon-circle" to="/recipes/scan" aria-label="Scan recipes" title="Scan recipes"><Icon d={CAMERA_ICON} size={18} /></Link>
                    <button className="icon-circle new-circle solid" aria-label="New recipe" title="New recipe" onClick={newRecipe}>+</button>
                </div>
            </div>
            {picked && <p className="muted small pick-hint">Tap recipes to pick them.</p>}

            {rows.length === 0 ? (
                <section className="card empty">
                    {db.recipes.length === 0 && recipesOnly
                        ? <>No recipes yet. <Link to="/recipes/scan">Scan a page</Link> from a cookbook or a recipe card, or type one in with +.</>
                        : db.recipes.length === 0
                        ? <>No recipes yet. Create one, start from the <Link to="/classics">classics library</Link>, or load sample data from the <Link to="/dashboard">Dashboard</Link>.</>
                        : "No recipes match that search."}
                </section>
            ) : recipesOnly ? (
                <MiniGrid>
                    {rows.map(({ recipe }) => (
                        <MiniTile key={recipe.id} name={recipe.name} photo={recipe.photo || undefined}
                            meta={names.get(recipe.createdBy) ? "By " + names.get(recipe.createdBy) : recipe.yieldUnit === "serving" && recipe.yieldAmount > 1 ? "Serves " + formatFraction(recipe.yieldAmount) : undefined}
                            to={"/recipes/" + recipe.id} picked={picked ? picked.has(recipe.id) : null} onClick={() => togglePick(recipe.id)} />
                    ))}
                </MiniGrid>
            ) : view === "grid" || picked ? (
                <MiniGrid>
                    {rows.map(({ recipe, summary }) => {
                        const over = summary?.ingredientRatio != null && summary.ingredientRatio > summary.targetCost + 0.05;
                        return (
                            <MiniTile key={recipe.id} name={recipe.name} photo={recipe.photo || undefined} tint={TINTS[recipe.type]} to={"/recipes/" + recipe.id}
                                picked={picked ? picked.has(recipe.id) : null} onClick={() => togglePick(recipe.id)}
                                badge={summary !== null && summary.missing.length > 0 ? "no price" : undefined}
                                meta={<>{summary?.ingredientRatio != null ? <span className={over ? "warn" : ""}>{formatPercent(summary.ingredientRatio)}</span> : recipe.type}
                                    {recipe.menuPrice !== null ? " · " + formatMoney(recipe.menuPrice) : ""}</>} />
                        );
                    })}
                </MiniGrid>
            ) : (
                <div className="card table-card">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Recipe</th>
                                <th className="num">Menu price</th>
                                <th className="num">Total cost</th>
                                <th className="num">Ingredient %</th>
                                <th className="num">Profit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ recipe, summary }) => (
                                // Clicking anywhere on the row opens the recipe
                                <tr key={recipe.id} className="clickable" onClick={() => navigate("/recipes/" + recipe.id)}>
                                    <td>
                                        {recipe.photo && <img className="recipe-thumb" src={recipe.photo} alt="" loading="lazy" />}
                                        <Link to={"/recipes/" + recipe.id} onClick={(e) => e.stopPropagation()}>
                                            <strong>{recipe.name}</strong>
                                        </Link>{" "}
                                        <span className="tag">{recipe.type}</span>
                                        {summary !== null && summary.missing.length > 0 && (
                                            <span className="tag warn-tag" title={"No price yet: " + summary.missing.join(", ")}>missing prices</span>
                                        )}
                                    </td>
                                    <td className="num">{recipe.menuPrice !== null ? formatMoney(recipe.menuPrice) : "—"}</td>
                                    <td className="num">
                                        {summary === null ? "loop" : formatMoney(summary.totalCost)}
                                        {summary !== null && !summary.perServing && <span className="muted"> /{recipe.yieldUnit}</span>}
                                    </td>
                                    {/* Red when ingredient cost is more than 5 points over the target for this type */}
                                    <td className={"num" + (summary?.ingredientRatio != null && summary.ingredientRatio > summary.targetCost + 0.05 ? " warn" : "")}>
                                        {summary?.ingredientRatio != null ? formatPercent(summary.ingredientRatio) : "—"}
                                    </td>
                                    <td className="num">{summary?.profit != null ? formatMoney(summary.profit) : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {/* Picked: grocery list (recipe books), add to a menu, delete */}
            {picked && (
                <div className="pick-bar">
                    <span>{picked.size} picked</span>
                    <span className="pick-actions labeled">
                        {recipesOnly && (
                            <Link className={"icon-circle" + (picked.size === 0 ? " disabled" : "")} aria-disabled={picked.size === 0} aria-label="Grocery list" title="Grocery list"
                                to={picked.size === 0 ? "#" : "/groceries/new?recipes=" + [...picked].join(",")}><Icon d={CART_ICON} size={18} /><span className="icon-label">Groceries</span></Link>
                        )}
                        <button className="icon-circle" disabled={picked.size === 0} aria-label="Add to a menu" title="Add to a menu" onClick={() => setMenuSheet(true)}>
                            <Icon d={MENU_ICON} size={18} /><span className="icon-label">Menu</span>
                        </button>
                        <button className="icon-circle danger-icon" disabled={picked.size === 0} aria-label="Delete" title="Delete" onClick={removePicked}>
                            <Icon d={TRASH_ICON} size={18} /><span className="icon-label">Delete</span>
                        </button>
                    </span>
                </div>
            )}
            {menuSheet && picked && <AddToMenuSheet recipeIds={[...picked]} onClose={() => setMenuSheet(false)} onDone={() => { setMenuSheet(false); setPicked(null); }} />}
        </div>
    );
}

// One icon for how the list looks: sort by, and tiles or a list with costs
function ViewMenu({ sort, onSort, view, onView }: { sort: SortKey; onSort: (key: SortKey) => void; view: "grid" | "list"; onView: (v: "grid" | "list") => void }) {
    const [open, setOpen] = useState(false);
    return (
        <span className="pop-wrap">
            <button className={"icon-circle" + (sort !== "name" || view !== "grid" ? " on" : "")} aria-label="Sort and view" title="Sort and view" aria-expanded={open} onClick={() => setOpen(!open)}>
                <Icon d={SORT_ICON} size={18} />
            </button>
            {open && (
                <>
                    <span className="pop-backdrop" onClick={() => setOpen(false)} />
                    <span className="pop-menu" role="menu">
                        <span className="pop-title">Show as</span>
                        <span className="pop-segment">
                            <button aria-pressed={view === "grid"} onClick={() => { onView("grid"); setOpen(false); }}><Icon d={GRID_ICON} size={16} /> Tiles</button>
                            <button aria-pressed={view === "list"} onClick={() => { onView("list"); setOpen(false); }}><Icon d={LIST_ICON} size={16} /> List</button>
                        </span>
                        <span className="pop-title">Sort by</span>
                        {SORTS.map((s) => (
                            <button key={s.key} role="menuitemradio" aria-checked={sort === s.key} className="pop-item" onClick={() => { onSort(s.key); setOpen(false); }}>
                                <span>{s.label}</span>{sort === s.key && <span aria-hidden="true">✓</span>}
                            </button>
                        ))}
                    </span>
                </>
            )}
        </span>
    );
}

// Add the picked recipes to a menu: a new one (type a name) or one that's already there
function AddToMenuSheet({ recipeIds, onClose, onDone }: { recipeIds: string[]; onClose: () => void; onDone: () => void }) {
    const db = useDb();
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const count = recipeIds.length === 1 ? findById(db.recipes, recipeIds[0])?.name ?? "1 recipe" : recipeIds.length + " recipes";

    // FOR each recipe: add it (a menu skips ones it already has)
    function addAll(menuId: string, menuName: string, open: boolean) {
        for (const id of recipeIds) addToMenu(menuId, id);
        toast("Added " + count + " to " + menuName);
        onDone();
        if (open) navigate("/menus/" + menuId);
    }

    function makeNew(e: React.FormEvent) {
        e.preventDefault();
        if (name.trim() === "") return;
        addAll(createMenu(name.trim()), name.trim(), true);
    }

    return (
        <Sheet title={"Add " + count + " to a menu"} onClose={onClose}>
            <form className="add-line new-menu-line" onSubmit={makeNew}>
                <input value={name} placeholder="New menu name" aria-label="New menu name" onChange={(e) => setName(e.target.value)} />
                <button type="submit" disabled={name.trim() === ""}>New menu</button>
            </form>
            {db.menus.length > 0 && (
                <ul className="menu-lines sheet-list">
                    {[...db.menus].sort((a, b) => a.name.localeCompare(b.name)).map((menu) => (
                        <li key={menu.id} className="menu-line">
                            <button className="menu-line-row menu-list-row sheet-pick" onClick={() => addAll(menu.id, menu.name, false)}>
                                <MenuPeek name={menu.name} />
                                <span className="menu-list-name"><strong>{menu.name}</strong></span>
                                <span className="chevron" aria-hidden="true">+</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Sheet>
    );
}
