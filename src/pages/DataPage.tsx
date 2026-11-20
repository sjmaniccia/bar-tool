// ===== DataPage.tsx =====
// Backup, restore, exports and the products spreadsheet import, all in one place.
//     Backup     download everything as one file (do this weekly until Step 6 adds a server)
//     Restore    pick a backup -> see what's in it -> replace everything
//     Exports    CSVs for the accountant or a spreadsheet
//     Import     a products sheet -> preview -> add or update the library

import { useState } from "react";
import { Link } from "react-router";
import { useDb } from "../data/storage";
import { download, parseCsv } from "../data/csv";
import {
    backupFileName, backupJson, countCsv, importProductRows, productsCsv, readBackup, readProductRows, recipesCsv,
    restoreBackup, rowBuyText, templateCsv, type BackupPreview, type ImportResult, type ProductRow
} from "../data/backup";
import { formatDate, formatMoney, plural, today } from "../data/utils";

export default function DataPage() {
    const db = useDb();
    const [backup, setBackup] = useState<BackupPreview | null>(null);
    const [backupError, setBackupError] = useState("");
    const [restored, setRestored] = useState(false);
    const [rows, setRows] = useState<ProductRow[] | null>(null);
    const [importError, setImportError] = useState("");
    const [imported, setImported] = useState<ImportResult | null>(null);

    const closed = db.stockCounts.filter((c) => c.status === "closed").sort((a, b) => b.countedAt.localeCompare(a.countedAt));
    const [countId, setCountId] = useState(closed[0]?.id ?? "");

    // WHEN a backup file is picked: read it and show what's inside (nothing changes yet)
    async function pickBackup(file: File | undefined) {
        setBackupError("");
        setRestored(false);
        if (!file) return;
        const result = readBackup(await file.text());
        if (typeof result === "string") setBackupError(result);
        else setBackup(result);
    }

    function restore() {
        if (backup === null) return;
        restoreBackup(backup);
        setBackup(null);
        setRestored(true);
    }

    // WHEN a products sheet is picked: read and check every row
    async function pickProducts(file: File | undefined) {
        setImportError("");
        setImported(null);
        if (!file) return;
        const result = readProductRows(parseCsv(await file.text()));
        if (typeof result === "string") setImportError(result);
        else setRows(result);
    }

    function runImport() {
        if (rows === null) return;
        setImported(importProductRows(rows));
        setRows(null);
    }

    const good = rows?.filter((r) => r.status !== "error").length ?? 0;
    const count = db.stockCounts.find((c) => c.id === countId) ?? null;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Data</h1>
                    <p className="muted">Your data lives in this browser. Back it up, take it to a spreadsheet, or bring a price list in.</p>
                </div>
            </div>

            <section className="card">
                <h2>Backup</h2>
                <p className="muted small">One file with everything: recipes, products, counts, invoices, sales. Keep a copy somewhere safe.</p>
                <div className="button-row">
                    <button onClick={() => download(backupFileName(), backupJson(), "application/json")}>Download backup</button>
                </div>

                <h3>Restore from a backup</h3>
                <p className="muted small">This replaces everything here with what's in the file.</p>
                <input type="file" accept=".json,application/json" aria-label="Backup file" onChange={(e) => pickBackup(e.target.files?.[0])} />
                {backupError && <p className="error">{backupError}</p>}
                {restored && <p className="success">Restored. Everything now matches the backup.</p>}
                {backup && (
                    <div className="import-draft">
                        <p>
                            {backup.savedAt ? "Saved " + formatDate(backup.savedAt) + ". " : ""}
                            It has {backup.counts.map((c) => c.count + " " + c.label).join(", ")}.
                        </p>
                        <div className="button-row">
                            <button className="danger" onClick={restore}>Replace everything with this backup</button>
                            <button className="secondary" onClick={() => setBackup(null)}>Cancel</button>
                        </div>
                    </div>
                )}
            </section>

            <section className="card">
                <h2>Export to a spreadsheet</h2>
                <div className="export-list">
                    <div className="export-row">
                        <div>
                            <strong>Inventory value</strong>
                            <p className="muted small">Every product in a closed count with its cost and value, for month-end books.</p>
                        </div>
                        <div className="button-row">
                            {closed.length === 0 ? <span className="muted small">Close a <Link to="/counts">count</Link> first</span> : (
                                <>
                                    <select aria-label="Count to export" value={countId} onChange={(e) => setCountId(e.target.value)}>
                                        {closed.map((c) => <option key={c.id} value={c.id}>{formatDate(c.countedAt) + (c.name ? " · " + c.name : "")}</option>)}
                                    </select>
                                    <button className="secondary" disabled={count === null}
                                        onClick={() => count && download("inventory-" + count.countedAt.slice(0, 10) + ".csv", countCsv(count.id))}>Export</button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="export-row">
                        <div>
                            <strong>Recipe costs</strong>
                            <p className="muted small">Every recipe's cost, price, cost % and profit.</p>
                        </div>
                        <button className="secondary" onClick={() => download("recipe-costs-" + today() + ".csv", recipesCsv())}>Export</button>
                    </div>
                    <div className="export-row">
                        <div>
                            <strong>Price list</strong>
                            <p className="muted small">Every product and how you buy it, in the same columns as the import below. Edit prices, then import it back.</p>
                        </div>
                        <button className="secondary" onClick={() => download("price-list-" + today() + ".csv", productsCsv())}>Export</button>
                    </div>
                </div>
            </section>

            <section className="card">
                <h2>Import products from a spreadsheet</h2>
                <p className="muted small">
                    Fastest way to set up: paste your distributor's price list into the template.
                    Rows that match a product and size you already have update its price instead of adding a copy.
                </p>
                <div className="button-row">
                    <button className="secondary" onClick={() => download("agave-products-template.csv", templateCsv())}>Download template</button>
                    <input type="file" accept=".csv,text/csv" aria-label="Products CSV file" onChange={(e) => pickProducts(e.target.files?.[0])} />
                </div>
                {importError && <p className="error">{importError}</p>}
                {imported && (
                    <p className="success">
                        Done: {plural(imported.products, "new product")}, {plural(imported.formats, "new size")}, {plural(imported.units, "new way")} to buy,
                        {" "}{plural(imported.prices, "price")} recorded{imported.vendors > 0 ? ", " + plural(imported.vendors, "new vendor") : ""}.
                        {" "}<Link to="/products">See products</Link>
                    </p>
                )}
                {rows && (
                    <div className="import-draft">
                        <table className="table compact">
                            <thead><tr><th>Row</th><th>Product</th><th>Size</th><th className="hide-phone">Buy as</th><th className="num">Price</th><th>Result</th></tr></thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.line} className={r.status === "error" ? "flagged" : ""}>
                                        <td className="muted">{r.line}</td>
                                        <td>{r.name || "—"}<div className="muted small">{r.family}{r.category ? " · " + r.category : ""}</div></td>
                                        <td>{isNaN(r.size) ? "—" : r.size + " " + r.unit + " " + r.packaging}</td>
                                        <td className="hide-phone">{rowBuyText(r)}</td>
                                        <td className="num">{r.price === null ? "—" : formatMoney(r.price)}</td>
                                        <td>
                                            {r.status === "error" && <span className="tag warn-tag">{r.problem}</span>}
                                            {r.status === "new" && <span className="status status-active">New</span>}
                                            {r.status === "update" && <span className="status status-waiting">Update</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="button-row">
                            <button disabled={good === 0} onClick={runImport}>Import {good} rows</button>
                            <button className="secondary" onClick={() => setRows(null)}>Cancel</button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
