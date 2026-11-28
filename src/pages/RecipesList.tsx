// ===== RecipesList.tsx =====
// All recipes in a table: search, sort, and click a row to open it.
// A "Just recipes" place: a plain list instead (picture, name, serves), A to Z, no costs.
//     Select -> tick recipes -> "Grocery list" makes one list from them (Groceries.tsx)
// Shown as a grid of small tiles (3 across on a phone, cost % on each); bars can switch to
// the detailed table with the list icon.

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { summarize, type RecipeSummary } from "../data/costing";
import { createRecipe } from "../data/actions";
import { formatFraction, formatMoney, formatPercent } from "../data/utils";
import { useRecipesOnly } from "../data/place";
import { useMemberNames } from "../cloud/names";
import { CART_ICON, Icon } from "./Groceries";
import { MiniGrid, MiniTile } from "../components/MiniGrid";
import type { Recipe } from "../data/types";

const TINTS: Record<Recipe["type"], string> = { Cocktail: "#f3ead8", Dish: "#efe6da", Beer: "#f3f1dc", Prep: "#e6efe9" };

type SortKey = "name" | "type" | "cost" | "ingredientRatio" | "profit";

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
            <div className="page-header">
                <h1>All Recipes</h1>
                <div className="button-row">
                    <Link className="button secondary" to="/recipes/scan">📷 Scan recipes</Link>
                    <button onClick={newRecipe}>+ New recipe</button>
                </div>
            </div>

            <div className="toolbar">
                <label className="search-box">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
                    <input type="search" aria-label="Search recipes" value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
                {!recipesOnly && (
                    <span className="view-toggle" role="group" aria-label="Show as">
                        <button aria-pressed={view === "grid"} aria-label="Grid" title="Grid" onClick={() => setView("grid")}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z" /></svg>
                        </button>
                        <button aria-pressed={view === "list"} aria-label="List with costs" title="List with costs" onClick={() => setView("list")}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16 M4 12h16 M4 18h16" /></svg>
                        </button>
                    </span>
                )}
                {recipesOnly && db.recipes.length > 0 && (
                    <button className="secondary" onClick={() => setPicked(picked ? null : new Set())}>{picked ? "Cancel" : "Select"}</button>
                )}
                {!recipesOnly && <label className="inline-label">
                    Sort
                    <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                        <option value="name">Name</option>
                        <option value="type">Type</option>
                        <option value="cost">Cost (low to high)</option>
                        <option value="ingredientRatio">Ingredient % (high to low)</option>
                        <option value="profit">Profit (high to low)</option>
                    </select>
                </label>}
            </div>

            {rows.length === 0 ? (
                <section className="card empty">
                    {db.recipes.length === 0 && recipesOnly
                        ? <>No recipes yet. <Link to="/recipes/scan">Scan a page</Link> from a cookbook or a recipe card, or type one in with + New recipe.</>
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
            ) : view === "grid" ? (
                <MiniGrid>
                    {rows.map(({ recipe, summary }) => {
                        const over = summary?.ingredientRatio != null && summary.ingredientRatio > summary.targetCost + 0.05;
                        return (
                            <MiniTile key={recipe.id} name={recipe.name} photo={recipe.photo || undefined} tint={TINTS[recipe.type]} to={"/recipes/" + recipe.id}
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
            {recipesOnly && picked && (
                <div className="pick-bar">
                    <span>{picked.size} picked</span>
                    <Link className={"button" + (picked.size === 0 ? " disabled" : "")} aria-disabled={picked.size === 0}
                        to={picked.size === 0 ? "#" : "/groceries/new?recipes=" + [...picked].join(",")}>
                        <Icon d={CART_ICON} size={18} /> Grocery list
                    </Link>
                </div>
            )}
        </div>
    );
}
