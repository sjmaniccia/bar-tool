// ===== SalesList.tsx =====
// Upload a sales report from the POS (a CSV "product mix" or "item sales" export).
//     1. Pick the file -> the columns are guessed from their headers
//     2. Check the guesses and the dates it covers
//     3. Import -> items that match a recipe by name are matched; the rest you match once
// Every POS can export this, so it works before any direct Toast or Square connection.

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { findColumn, parseCsv, parseMoney } from "../data/csv";
import { deleteSalesImport, importSales, isIgnored, type ParsedSale } from "../data/variance";
import { formatDate, formatMoney, today } from "../data/utils";

interface Draft {
    fileName: string;
    headers: string[];
    rows: string[][];
    item: number;
    quantity: number;
    revenue: number;
    startDate: string;
    endDate: string;
}

export default function SalesList() {
    const db = useDb();
    const navigate = useNavigate();
    const [draft, setDraft] = useState<Draft | null>(null);
    const [error, setError] = useState("");

    // WHEN a file is picked: read it, take the first row as headers, guess the columns
    async function pick(file: File | undefined) {
        setError("");
        if (!file) return;
        const rows = parseCsv(await file.text());
        if (rows.length < 2) return setError("That file has no rows to import.");
        const headers = rows[0];
        setDraft({
            fileName: file.name,
            headers,
            rows: rows.slice(1),
            item: Math.max(0, findColumn(headers, ["item", "menu item", "item name", "name", "product"])),
            quantity: findColumn(headers, ["quantity", "qty", "sold", "count", "items sold"]),
            revenue: findColumn(headers, ["net sales", "sales", "revenue", "amount", "total", "gross sales"]),
            startDate: today(),
            endDate: today()
        });
    }

    // The rows as sales, skipping totals and rows with no quantity
    function parsed(d: Draft): ParsedSale[] {
        return d.rows
            .map((row) => ({
                itemName: (row[d.item] ?? "").trim(),
                quantity: d.quantity === -1 ? NaN : parseMoney(row[d.quantity] ?? ""),
                revenue: d.revenue === -1 ? 0 : parseMoney(row[d.revenue] ?? "") || 0
            }))
            .filter((s) => s.itemName !== "" && !/^(total|grand total|subtotal)$/i.test(s.itemName) && !isNaN(s.quantity));
    }

    function save() {
        if (draft === null) return;
        if (draft.quantity === -1) return setError("Pick the column with how many were sold.");
        if (draft.endDate < draft.startDate) return setError("The last day can't be before the first day.");
        const sales = parsed(draft);
        if (sales.length === 0) return setError("No rows had an item name and a quantity.");
        const id = importSales(draft.fileName, draft.startDate, draft.endDate, sales);
        setDraft(null);
        navigate("/sales/" + id);
    }

    const imports = [...db.salesImports].sort((a, b) => b.endDate.localeCompare(a.endDate));

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Sales</h1>
                    <p className="muted">Import what your POS sold. It's what turns counts into "sold vs used" on the <Link to="/reports">Variance</Link> report.</p>
                </div>
            </div>

            <section className="card">
                <h2>Import a sales report</h2>
                <p className="muted small">
                    In your POS, export item sales (Toast: Product Mix; Square: Item Sales) as a CSV for the days between two counts.
                </p>
                <input type="file" accept=".csv,text/csv" aria-label="Sales CSV file" onChange={(e) => pick(e.target.files?.[0])} />
                {error && <p className="error">{error}</p>}

                {draft && (
                    <div className="import-draft">
                        <div className="form-grid four">
                            <ColumnPick label="Item name" headers={draft.headers} value={draft.item} onChange={(item) => setDraft({ ...draft, item })} />
                            <ColumnPick label="Quantity sold" headers={draft.headers} value={draft.quantity} onChange={(quantity) => setDraft({ ...draft, quantity })} />
                            <ColumnPick label="Sales $ (optional)" headers={draft.headers} value={draft.revenue} optional onChange={(revenue) => setDraft({ ...draft, revenue })} />
                            <div />
                            <label className="form-field"><span>First day</span>
                                <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></label>
                            <label className="form-field"><span>Last day</span>
                                <input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} /></label>
                        </div>
                        <p className="muted small">Preview: first rows as they'll be imported</p>
                        <table className="table compact">
                            <thead><tr><th>Item</th><th className="num">Sold</th><th className="num">Sales</th></tr></thead>
                            <tbody>
                                {parsed(draft).slice(0, 5).map((s, i) => (
                                    <tr key={i}><td>{s.itemName}</td><td className="num">{s.quantity}</td><td className="num">{formatMoney(s.revenue)}</td></tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="button-row">
                            <button onClick={save}>Import {parsed(draft).length} rows</button>
                            <button className="secondary" onClick={() => setDraft(null)}>Cancel</button>
                        </div>
                    </div>
                )}
            </section>

            <section className="card table-card">
                <h2>Imported reports</h2>
                {imports.length === 0 ? <p className="card-pad muted">Nothing imported yet.</p> : (
                    <table className="table">
                        <thead><tr><th>Report</th><th>Days</th><th className="num">Items</th><th className="num">Sales</th><th className="num">To match</th><th></th></tr></thead>
                        <tbody>
                            {imports.map((imp) => {
                                const lines = db.salesLines.filter((l) => l.importId === imp.id);
                                const unmatched = lines.filter((l) => l.recipeId === null && !isIgnored(l)).length;
                                return (
                                    <tr key={imp.id} className="clickable" onClick={() => navigate("/sales/" + imp.id)}>
                                        <td><Link to={"/sales/" + imp.id} onClick={(e) => e.stopPropagation()}>{imp.name}</Link></td>
                                        <td>{formatDate(imp.startDate)} to {formatDate(imp.endDate)}</td>
                                        <td className="num">{lines.length}</td>
                                        <td className="num">{formatMoney(lines.filter((l) => !isIgnored(l)).reduce((s, l) => s + l.revenue, 0))}</td>
                                        <td className={"num" + (unmatched > 0 ? " warn" : "")}>{unmatched}</td>
                                        <td className="num"><button className="danger icon-button" aria-label="Delete import"
                                            onClick={(e) => { e.stopPropagation(); if (confirm("Delete this sales report?")) deleteSalesImport(imp.id); }}>✕</button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}

// A dropdown of the file's column headers
function ColumnPick({ label, headers, value, optional = false, onChange }: { label: string; headers: string[]; value: number; optional?: boolean; onChange: (i: number) => void }) {
    return (
        <label className="form-field">
            <span>{label}</span>
            <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
                {optional && <option value={-1}>None</option>}
                {!optional && value === -1 && <option value={-1}>Pick a column…</option>}
                {headers.map((h, i) => <option key={i} value={i}>{h || "Column " + (i + 1)}</option>)}
            </select>
        </label>
    );
}
