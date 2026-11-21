// ===== CountsList.tsx =====
// Stock counts and the storage areas they're counted in.
// The latest CLOSED count is what "on hand" means everywhere else (products, ordering).

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { countTotals, createArea, createCount, deleteArea, latestClosedCount, renameArea } from "../data/inventory";
import { formatDate, formatMoney } from "../data/utils";
import TextInput from "../components/TextInput";
import Status from "../components/Status";
import { useSession } from "../cloud/session";
import { canEdit } from "../cloud/access";

export default function CountsList() {
    const db = useDb();
    const managing = canEdit(useSession().bar?.role ?? null);   // staff count, managers set up areas
    const navigate = useNavigate();
    const counts = [...db.stockCounts].sort((a, b) => b.countedAt.localeCompare(a.countedAt));
    const latest = latestClosedCount();

    function startCount() {
        navigate("/counts/" + createCount("Count"));
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Stock counts</h1>
                    <p className="muted">Count each area in unopened cases plus loose units. Finishing a count updates on-hand everywhere.</p>
                </div>
                <button onClick={startCount}>+ Start a count</button>
            </div>

            <div className="stat-row">
                <div className="stat">
                    <span className="stat-label">Inventory value</span>
                    <span className="stat-value">{latest ? formatMoney(countTotals(latest.id).value) : "—"}</span>
                    <span className="stat-ratio">{latest ? "as of " + formatDate(latest.countedAt) : "Finish a count to see it"}</span>
                </div>
                <div className="stat">
                    <span className="stat-label">Counts</span>
                    <span className="stat-value">{counts.length}</span>
                    <span className="stat-ratio">{counts.filter((c) => c.status === "open").length} open</span>
                </div>
                <div className="stat">
                    <span className="stat-label">Storage areas</span>
                    <span className="stat-value">{db.areas.length}</span>
                </div>
            </div>

            <section className="card table-card">
                <h2>Counts</h2>
                {counts.length === 0 ? (
                    <p className="card-pad muted">No counts yet. Start one, or load sample data from the <Link to="/dashboard">Dashboard</Link>.</p>
                ) : (
                    <table className="table">
                        <thead><tr><th>Count</th><th>Date</th><th>Status</th><th className="num">Items</th><th className="num">Value</th></tr></thead>
                        <tbody>
                            {counts.map((count) => {
                                const totals = countTotals(count.id);
                                return (
                                    <tr key={count.id} className="clickable" onClick={() => navigate("/counts/" + count.id)}>
                                        <td><Link to={"/counts/" + count.id} onClick={(e) => e.stopPropagation()}>{count.name}</Link></td>
                                        <td>{formatDate(count.countedAt)}</td>
                                        <td><Status status={count.status} /></td>
                                        <td className="num">{totals.units.size}</td>
                                        <td className="num">{formatMoney(totals.value)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </section>

            {managing && <AreasCard />}
        </div>
    );
}


// Storage areas: rename in place, remove, add new
function AreasCard() {
    const db = useDb();
    const [name, setName] = useState("");

    function add(event: FormEvent) {
        event.preventDefault();
        if (name.trim() === "") return;
        createArea(name);
        setName("");
    }

    return (
        <section className="card">
            <h2>Storage areas</h2>
            <p className="muted small">Where things are kept. Each count has a tab for every area, in this order.</p>
            <ul className="plain-list">
                {db.areas.map((area) => (
                    <li key={area.id} className="row-edit">
                        <TextInput value={area.name} required ariaLabel="Area name" onSave={(n) => renameArea(area.id, n)} />
                        <button className="link-button" onClick={() => confirm("Remove " + area.name + "? Anything counted there moves to No area.") && deleteArea(area.id)}>
                            remove
                        </button>
                    </li>
                ))}
            </ul>
            <form className="add-line" onSubmit={add}>
                <input value={name} placeholder="e.g. Walk-in, Back bar, Keg cooler" aria-label="New area" onChange={(e) => setName(e.target.value)} />
                <button type="submit" className="secondary">Add area</button>
            </form>
        </section>
    );
}
