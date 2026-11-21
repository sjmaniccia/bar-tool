// ===== RecipesList.tsx =====
// All recipes in a table: search, sort, and click a row to open it.

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { summarize, type RecipeSummary } from "../data/costing";
import { createRecipe } from "../data/actions";
import { formatMoney, formatPercent } from "../data/utils";
import type { Recipe } from "../data/types";

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
    const [sortKey, setSortKey] = useState<SortKey>("name");

    // Each recipe with its summary, filtered by the search box
    const rows = db.recipes
        .filter((recipe) => recipe.name.toLowerCase().includes(search.trim().toLowerCase()))
        .map((recipe) => ({ recipe, summary: safeSummary(recipe) }));

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
        <div className="page">
            <div className="page-header">
                <h1>All Recipes</h1>
                <button onClick={newRecipe}>+ New recipe</button>
            </div>

            <div className="toolbar">
                <input
                    type="search"
                    placeholder="Search recipes…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <label className="inline-label">
                    Sort
                    <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                        <option value="name">Name</option>
                        <option value="type">Type</option>
                        <option value="cost">Cost (low to high)</option>
                        <option value="ingredientRatio">Ingredient % (high to low)</option>
                        <option value="profit">Profit (high to low)</option>
                    </select>
                </label>
            </div>

            {rows.length === 0 ? (
                <section className="card empty">
                    {db.recipes.length === 0
                        ? <>No recipes yet. Create one, start from the <Link to="/classics">classics library</Link>, or load sample data from the <Link to="/dashboard">Dashboard</Link>.</>
                        : "No recipes match that search."}
                </section>
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
        </div>
    );
}
