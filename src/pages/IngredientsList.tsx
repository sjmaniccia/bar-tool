// ===== IngredientsList.tsx =====
// Every ingredient recipes can ask for, with where it comes from and what it costs.
//     house  = the source you chose (a product you buy, or a recipe you make)
//     no house choice = the cheapest source is used, marked "cheapest"

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { createIngredient, ingredientCost, recipesUsingIngredient } from "../data/library";
import { sourceName, sourcesFor } from "../data/costing";
import { formatMoney } from "../data/utils";

export default function IngredientsList() {
    const db = useDb();
    const navigate = useNavigate();
    const [search, setSearch] = useState("");

    const rows = db.ingredients
        .filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    function newIngredient() {
        navigate("/ingredients/" + createIngredient("New ingredient"));
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Ingredients</h1>
                    <p className="muted">What recipes ask for, and which product or prep fills it.</p>
                </div>
                <button onClick={newIngredient}>+ New ingredient</button>
            </div>

            <div className="toolbar">
                <input type="search" placeholder="Search ingredients…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            {rows.length === 0 ? (
                <section className="card empty">
                    {db.ingredients.length === 0
                        ? <>No ingredients yet. They're added as you write recipes, or load sample data from the <Link to="/">Dashboard</Link>.</>
                        : "No ingredients match that search."}
                </section>
            ) : (
                <div className="card table-card">
                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Ingredient</th>
                                    <th>Comes from</th>
                                    <th className="num">Cost</th>
                                    <th className="num hide-phone">Sources</th>
                                    <th className="num hide-phone">Used in</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((ingredient) => {
                                    const cost = ingredientCost(ingredient);
                                    const sources = sourcesFor(ingredient.id).length;
                                    const used = recipesUsingIngredient(ingredient.id).length;
                                    return (
                                        <tr key={ingredient.id} className="clickable" onClick={() => navigate("/ingredients/" + ingredient.id)}>
                                            <td><Link to={"/ingredients/" + ingredient.id} onClick={(e) => e.stopPropagation()}>{ingredient.name}</Link></td>
                                            <td className="small">
                                                {cost === null
                                                    ? <span className="tag warn-tag">no source yet</span>
                                                    : <>{sourceName(cost.source)} <span className={"tag" + (cost.isHouse ? " house" : "")}>{cost.isHouse ? "house" : "cheapest"}</span></>}
                                            </td>
                                            <td className="num">{cost === null ? "—" : formatMoney(cost.cost) + " / " + cost.unit}</td>
                                            <td className="num hide-phone">{sources}</td>
                                            <td className="num hide-phone">{used === 0 ? "—" : used + (used === 1 ? " recipe" : " recipes")}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
