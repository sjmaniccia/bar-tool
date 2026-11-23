// ===== SpecBooks.tsx =====
// Every menu's spec book, without costs, so staff can study and print them.

import { Link } from "react-router";
import { useDb } from "../data/storage";
import { itemsOf } from "../data/menus";

export default function SpecBooks() {
    const db = useDb();
    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Spec books</h1>
                    <p className="muted">Every recipe on each menu: the build, glass or plate, garnish and method. No costs, so they can go where the staff work.</p>
                </div>
            </div>
            {db.menus.length === 0 ? (
                <section className="card empty">No menus yet. A manager makes them on the Menus page.</section>
            ) : (
                <div className="card-grid">
                    {db.menus.map((menu) => (
                        <Link key={menu.id} to={"/menus/" + menu.id + "/specs"} className="card stat-card">
                            <h2>{menu.name}</h2>
                            <span className="muted">{itemsOf(menu.id).length} recipes</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
