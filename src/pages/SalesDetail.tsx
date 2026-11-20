// ===== SalesDetail.tsx =====
// One imported sales report: match each POS item to a recipe.
// A match is remembered by name, so next week's import matches itself.
// "Ignore" is for things that aren't drinks or dishes (gift cards, merch, service fees).

import { Link, useNavigate, useParams } from "react-router";
import { useDb } from "../data/storage";
import { deleteSalesImport, isIgnored, linkPosItem } from "../data/variance";
import { findById, formatDate, formatMoney } from "../data/utils";

export default function SalesDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { importId } = useParams();
    const report = findById(db.salesImports, importId ?? null);

    if (report === null) {
        return (
            <div className="page">
                <h1>Sales report not found</h1>
                <Link to="/sales">← Sales</Link>
            </div>
        );
    }

    // Unmatched first, then by most sold
    const lines = db.salesLines
        .filter((l) => l.importId === report.id)
        .sort((a, b) => Number(a.recipeId !== null || isIgnored(a)) - Number(b.recipeId !== null || isIgnored(b)) || b.quantity - a.quantity);
    const unmatched = lines.filter((l) => l.recipeId === null && !isIgnored(l)).length;
    const recipes = db.recipes.filter((r) => r.type !== "Prep").sort((a, b) => a.name.localeCompare(b.name));
    const total = lines.filter((l) => !isIgnored(l)).reduce((s, l) => s + l.revenue, 0);

    return (
        <div className="page">
            <Link to="/sales" className="back">← Sales</Link>
            <div className="page-header">
                <div>
                    <h1>{report.name}</h1>
                    <div className="tags">
                        <span className="tag">{formatDate(report.startDate)} to {formatDate(report.endDate)}</span>
                        <span className="tag house">{formatMoney(total)}</span>
                        {unmatched > 0 && <span className="tag warn-tag">{unmatched} to match</span>}
                    </div>
                </div>
                <div className="button-row">
                    <Link className="button" to="/reports">See variance</Link>
                    <button className="danger" onClick={() => { if (confirm("Delete this sales report?")) { deleteSalesImport(report.id); navigate("/sales"); } }}>Delete</button>
                </div>
            </div>

            {unmatched > 0 && (
                <section className="card warn-box">
                    {unmatched} {unmatched === 1 ? "item doesn't" : "items don't"} match a recipe yet. Until they do, what they used shows up as missing on the variance report.
                </section>
            )}

            <section className="card table-card">
                <div className="table-scroll">
                    <table className="table">
                        <thead><tr><th>POS item</th><th className="num">Sold</th><th className="num">Sales</th><th>Recipe</th></tr></thead>
                        <tbody>
                            {lines.map((line) => {
                                const ignored = isIgnored(line);
                                const value = ignored ? "ignore" : line.recipeId ?? "";
                                return (
                                    <tr key={line.id} className={value === "" ? "needs-match" : ""}>
                                        <td><strong>{line.itemName}</strong></td>
                                        <td className="num">{line.quantity}</td>
                                        <td className={"num" + (ignored ? " muted" : "")}>{formatMoney(line.revenue)}</td>
                                        <td>
                                            <select value={value} aria-label={"Recipe for " + line.itemName} onChange={(e) => linkPosItem(line.itemName, e.target.value)}>
                                                <option value="">Not matched…</option>
                                                <option value="ignore">Ignore (not a drink or dish)</option>
                                                {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
            <p className="muted small">No recipe for an item yet? <Link to="/recipes">Create it</Link>, then match it here.</p>
        </div>
    );
}
