// ===== MenusList.tsx =====
// Menus: groups of recipes (the fall list, brunch) with their average cost and profit.

import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { createMenu, itemsOf, menuStats } from "../data/menus";
import { formatMoney, formatPercent } from "../data/utils";

export default function MenusList() {
    const db = useDb();
    const navigate = useNavigate();

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Menus</h1>
                    <p className="muted">Group recipes into menus to see their margins together and print a spec book for staff.</p>
                </div>
                <button onClick={() => navigate("/menus/" + createMenu("New menu"))}>+ New menu</button>
            </div>

            {db.menus.length === 0 ? (
                <section className="card empty">No menus yet. Make one, or load sample data from the <Link to="/dashboard">Dashboard</Link>.</section>
            ) : (
                <div className="card-grid">
                    {db.menus.map((menu) => {
                        const stats = menuStats(menu.id);
                        const count = itemsOf(menu.id).length;
                        return (
                            <Link key={menu.id} to={"/menus/" + menu.id} className="card stat-card">
                                <h2>{menu.name}</h2>
                                {menu.description && <span className="muted small">{menu.description}</span>}
                                <span className="stat-label">{count} {count === 1 ? "item" : "items"}</span>
                                <span>
                                    Avg cost <strong>{stats.averageCostRatio === null ? "—" : formatPercent(stats.averageCostRatio)}</strong>
                                    {" · "}avg profit <strong>{stats.averageProfit === null ? "—" : formatMoney(stats.averageProfit)}</strong>
                                </span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
