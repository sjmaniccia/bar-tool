// ===== Dashboard.tsx =====
// The home page: counts of everything, and a way to load sample data.

import { Link } from "react-router";
import { useDb, replaceAll } from "../data/storage";
import { sampleData } from "../data/sampleData";

export default function Dashboard() {
    const db = useDb();   // redraws whenever data changes

    const counts = [
        { label: "Recipes", count: db.recipes.length, to: "/recipes" },
        { label: "Products", count: db.products.length, to: "/products" },
        { label: "Ingredients", count: db.ingredients.length, to: "/ingredients" },
        { label: "Vendors", count: db.vendors.length, to: "/vendors" }
    ];

    // Replace everything with the sample bar
    //     IF there's already data, ask first
    function loadSample() {
        const hasData = db.recipes.length + db.products.length > 0;
        if (hasData && !confirm("This replaces all your current data with sample data. Continue?")) {
            return;
        }
        replaceAll(sampleData());
    }

    return (
        <div className="page">
            <h1>Dashboard</h1>

            <div className="stat-grid">
                {counts.map((c) => (
                    <Link key={c.label} to={c.to} className="card stat-card">
                        <span className="stat-label">{c.label}</span>
                        <span className="stat-number">{c.count}</span>
                    </Link>
                ))}
            </div>

            <section className="card">
                <h2>Getting started</h2>
                <ol className="steps">
                    <li>Add vendors and products (with prices) on the <Link to="/products">Products</Link> screen.</li>
                    <li>Write recipes on <Link to="/recipes">All Recipes</Link>. Ingredients can be added before any products exist.</li>
                    <li>Pick house choices and compare vendors on <Link to="/ingredients">Ingredients</Link>.</li>
                </ol>
                <button className="secondary" onClick={loadSample}>Load sample data</button>
            </section>
        </div>
    );
}
