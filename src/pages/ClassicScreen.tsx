// ===== ClassicScreen.tsx =====
// Products, Ingredients and Vendors haven't been rebuilt yet.
// The original screens still work at /legacy and share the same saved data,
// so anything added there shows up here.

import { useDb } from "../data/storage";

export default function ClassicScreen({ name }: { name: string }) {
    const db = useDb();
    return (
        <div className="page">
            <h1>{name}</h1>
            <section className="card">
                <p>
                    This screen hasn't been rebuilt yet. Use the classic version for now. It saves to the same data,
                    so changes appear here right away.
                </p>
                <p className="muted">
                    {db.products.length} products · {db.ingredients.length} ingredients · {db.vendors.length} vendors
                </p>
                <a className="button" href="./legacy/" target="_blank" rel="noreferrer">Open classic {name}</a>
            </section>
        </div>
    );
}
