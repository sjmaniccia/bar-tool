// ===== MenusList.tsx =====
// Menus: groups of recipes (the fall list, brunch) with their average cost and profit.

import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { createMenu, itemsOf, menuStats } from "../data/menus";
import { findById, formatMoney, formatPercent } from "../data/utils";
import { useRecipesOnly } from "../data/place";
import { FamilyMenusList } from "./FamilyMenus";

export default function MenusList() {
    return useRecipesOnly() ? <FamilyMenusList /> : <BarMenusList />;
}

function BarMenusList() {
    const db = useDb();
    const navigate = useNavigate();

    return (
        <div className="page menu-page tile-page">
            <div className="page-header">
                <div>
                    <h1>Menus</h1>
                    <p className="muted">Group recipes into menus to see their margins together and print a spec sheet for staff.</p>
                </div>
                <button className="icon-circle new-circle" aria-label="New menu" title="New menu" onClick={() => navigate("/menus/" + createMenu("New menu"))}>+</button>
            </div>

            {db.menus.length === 0 ? (
                <section className="card empty">No menus yet. Make one with +, or load sample data from the <Link to="/dashboard">Dashboard</Link>.</section>
            ) : (
                // One line per menu: a peek at what's on it, the name, the count, avg cost · avg profit
                <ul className="card menu-lines">
                    {[...db.menus].sort((a, b) => a.name.localeCompare(b.name)).map((menu) => {
                        const stats = menuStats(menu.id);
                        const recipes = itemsOf(menu.id).map((i) => findById(db.recipes, i.recipeId)).filter((r) => r !== null);
                        return (
                            <li key={menu.id} className="menu-line">
                                <Link to={"/menus/" + menu.id} className="menu-line-row menu-list-row">
                                    <MenuPeek name={menu.name} />
                                    <span className="menu-list-name">
                                        <strong>{menu.name}</strong>
                                        <span className="muted small">{recipes.length} {recipes.length === 1 ? "item" : "items"}</span>
                                    </span>
                                    <span className="menu-line-nums">
                                        {stats.averageCostRatio === null ? <span className="muted">no prices</span>
                                            : <>{formatPercent(stats.averageCostRatio)}<span className="muted"> · {formatMoney(stats.averageProfit ?? 0)}</span></>}
                                    </span>
                                    <span className="chevron" aria-hidden="true">›</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
            {db.menus.length > 0 && <p className="muted small">Avg cost of menu price · avg profit per item sold.</p>}
        </div>
    );
}

// A small tinted square with the menu's first letter, so each menu is easy to spot
const PEEK_TINTS = ["#efe6da", "#e6efe9", "#f3ead8", "#e9e6f0", "#f0e3e3", "#e3ecf0"];
export function MenuPeek({ name }: { name: string }) {
    // SET tint FROM the name, so a menu keeps the same color
    let sum = 0;
    for (const ch of name) sum += ch.charCodeAt(0);
    return (
        <span className="menu-peek" aria-hidden="true" style={{ background: PEEK_TINTS[sum % PEEK_TINTS.length] }}>
            {name.trim().charAt(0).toUpperCase() || "·"}
        </span>
    );
}
