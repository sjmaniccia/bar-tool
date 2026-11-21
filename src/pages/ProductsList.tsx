// ===== ProductsList.tsx =====
// The product library: everything the bar buys.
// Search by name, filter by family or vendor, click a row to open it.
// "On hand" comes from the latest closed stock count; red means below par.

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { FAMILIES, createProduct } from "../data/library";
import { onHand, unitCost, unitWord } from "../data/inventory";
import { formatName } from "../data/costing";
import { findById, formatAmount, formatMoney } from "../data/utils";

export default function ProductsList() {
    const db = useDb();
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [family, setFamily] = useState("");
    const [vendorId, setVendorId] = useState("");

    const wanted = search.trim().toLowerCase();

    // Each product that passes the filters
    //     search matches the name, category or producer
    //     family matches (or "All")
    //     at least one way to buy it comes from the vendor (or "All")
    const rows = db.products
        .filter((p) => wanted === "" || [p.name, p.category, p.subcategory, p.producer].some((t) => t.toLowerCase().includes(wanted)))
        .filter((p) => family === "" || p.family === family)
        .filter((p) => vendorId === "" || db.formats.some((f) => f.productId === p.id &&
            db.purchaseUnits.some((u) => u.formatId === f.id && u.vendorId === vendorId)))
        .sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name));

    function newProduct() {
        const id = createProduct("New product", family || "Spirits");
        navigate("/products/" + id);
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Products</h1>
                    <p className="muted">Everything you buy, how it's packed, and what it costs.</p>
                </div>
                <button onClick={newProduct}>+ New product</button>
            </div>

            <div className="toolbar">
                <input type="search" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <label className="inline-label">
                    Family
                    <select value={family} onChange={(e) => setFamily(e.target.value)}>
                        <option value="">All</option>
                        {FAMILIES.map((f) => <option key={f}>{f}</option>)}
                    </select>
                </label>
                <label className="inline-label">
                    Vendor
                    <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                        <option value="">All</option>
                        {db.vendors.map((v) => <option key={v.id} value={v.id}>{v.companyName}</option>)}
                    </select>
                </label>
            </div>

            {rows.length === 0 ? (
                <section className="card empty">
                    {db.products.length === 0
                        ? <>No products yet. Add one, or load sample data from the <Link to="/dashboard">Dashboard</Link>.</>
                        : "No products match those filters."}
                </section>
            ) : (
                <div className="card table-card">
                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th className="hide-phone">Category</th>
                                    <th className="hide-phone">Counts as</th>
                                    <th className="hide-phone">Formats</th>
                                    <th className="num">Cost per unit</th>
                                    <th className="num">On hand / par</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((product) => {
                                    const formats = db.formats.filter((f) => f.productId === product.id);
                                    const ingredient = findById(db.ingredients, product.ingredientId);
                                    return (
                                        <tr key={product.id} className="clickable" onClick={() => navigate("/products/" + product.id)}>
                                            <td>
                                                <Link to={"/products/" + product.id} onClick={(e) => e.stopPropagation()}>{product.name}</Link>
                                                {product.producer && <div className="muted small">{product.producer}</div>}
                                            </td>
                                            <td className="hide-phone">
                                                <span className="tag">{product.family}</span>
                                                {product.category && <span className="muted small"> {product.category}{product.subcategory && " · " + product.subcategory}</span>}
                                            </td>
                                            <td className="hide-phone">{ingredient ? ingredient.name : <span className="muted">—</span>}</td>
                                            <td className="small hide-phone">{formats.map((f) => formatName(f)).join(", ") || "—"}</td>
                                            <td className="num">
                                                {formats.map((f) => {
                                                    const cost = unitCost(f.id);
                                                    return <div key={f.id}>{cost === null ? "—" : formatMoney(cost) + " / " + unitWord(f)}</div>;
                                                })}
                                            </td>
                                            <td className="num">
                                                {formats.map((f) => {
                                                    const have = onHand(f.id);
                                                    const low = have !== null && f.par !== null && have < f.par;
                                                    return (
                                                        <div key={f.id} className={low ? "warn" : ""}>
                                                            {have === null ? "—" : formatAmount(have)}
                                                            <span className="muted"> / {f.par === null ? "—" : formatAmount(f.par)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </td>
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
