// ===== CountDetail.tsx =====
// One stock count, done area by area like walking the bar with a clipboard:
//     one tab per area: type unopened cases + loose units for each product
//     Summary tab: totals across areas, against par, with the value
// Finishing the count makes it the "on hand" used by products and ordering.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDb } from "../data/storage";
import {
    caseSize, countTotals, deleteCount, findCountLine, formatLabel, lineUnits, setCount, unitCost, unitWord, updateCount
} from "../data/inventory";
import { FAMILIES } from "../data/library";
import { findById, formatAmount, formatDate, formatMoney } from "../data/utils";
import type { Format } from "../data/types";
import TextInput from "../components/TextInput";
import AmountInput from "../components/AmountInput";
import Status from "../components/Status";

const SUMMARY = "summary";

export default function CountDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { countId } = useParams();
    const count = findById(db.stockCounts, countId ?? null);
    const [tab, setTab] = useState<string>(db.areas[0]?.id ?? "none");
    const [search, setSearch] = useState("");
    const [family, setFamily] = useState("");

    if (count === null) {
        return (
            <div className="page">
                <h1>Count not found</h1>
                <Link to="/counts">← Stock counts</Link>
            </div>
        );
    }

    const locked = count.status === "closed";
    const totals = countTotals(count.id);
    // "No area" only shows up if something was counted without one (e.g. its area was removed)
    const hasNoArea = db.countLines.some((l) => l.countId === count.id && l.areaId === null);
    const tabs = [...db.areas.map((a) => ({ id: a.id, name: a.name })), ...(hasNoArea || db.areas.length === 0 ? [{ id: "none", name: "No area" }] : [])];
    const areaId = tab === "none" ? null : tab;

    // Every format, filtered by search and family, sorted by family then name
    const wanted = search.trim().toLowerCase();
    const formats = db.formats
        .map((format) => ({ format, product: findById(db.products, format.productId) }))
        .filter(({ product }) => product !== null)
        .filter(({ product }) => wanted === "" || product!.name.toLowerCase().includes(wanted))
        .filter(({ product }) => family === "" || product!.family === family)
        .sort((a, b) => a.product!.family.localeCompare(b.product!.family) || a.product!.name.localeCompare(b.product!.name));

    function remove() {
        if (!confirm("Delete this count?")) return;
        deleteCount(count!.id);
        navigate("/counts");
    }

    return (
        <div className="page">
            <Link to="/counts" className="back">← Stock counts</Link>
            <div className="page-header">
                <div>
                    <h1>{count.name}</h1>
                    <div className="tags">
                        <Status status={count.status} />
                        <span className="tag">{formatDate(count.countedAt)}</span>
                        <span className="tag house">{formatMoney(totals.value)}</span>
                    </div>
                </div>
                <div className="button-row">
                    {locked
                        ? <button className="secondary" onClick={() => updateCount(count.id, { status: "open" })}>Reopen</button>
                        : <button onClick={() => updateCount(count.id, { status: "closed" })}>Finish count</button>}
                    <button className="secondary" onClick={() => window.print()}>Print</button>
                    <button className="danger" onClick={remove}>Delete</button>
                </div>
            </div>

            {!locked && (
                <section className="card no-print">
                    <div className="form-grid">
                        <label className="form-field"><span>Name</span>
                            <TextInput value={count.name} required onSave={(name) => updateCount(count.id, { name })} /></label>
                        <label className="form-field"><span>Date</span>
                            <TextInput type="date" value={count.countedAt} required onSave={(countedAt) => updateCount(count.id, { countedAt })} /></label>
                    </div>
                </section>
            )}

            <div className="tab-row no-print" role="tablist">
                {tabs.map((t) => (
                    <button key={t.id} role="tab" aria-selected={tab === t.id} className={"tab" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
                        {t.name}
                    </button>
                ))}
                <button role="tab" aria-selected={tab === SUMMARY} className={"tab" + (tab === SUMMARY ? " active" : "")} onClick={() => setTab(SUMMARY)}>
                    Summary
                </button>
            </div>

            <div className="toolbar no-print">
                <input type="search" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <label className="inline-label">
                    Family
                    <select value={family} onChange={(e) => setFamily(e.target.value)}>
                        <option value="">All</option>
                        {FAMILIES.map((f) => <option key={f}>{f}</option>)}
                    </select>
                </label>
            </div>

            {formats.length === 0 ? (
                <section className="card empty">
                    {db.formats.length === 0 ? <>No products to count yet. Add some on <Link to="/products">Products</Link>.</> : "Nothing matches."}
                </section>
            ) : tab === SUMMARY ? (
                <SummaryTable formats={formats.map((f) => f.format)} totals={totals.units} />
            ) : (
                <section className="card table-card">
                    <div className="table-scroll">
                        <table className="table count-sheet">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Cases</th>
                                    <th>Loose</th>
                                    <th className="num hide-phone">Here</th>
                                    <th className="num hide-phone">All areas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {formats.map(({ format }) => (
                                    <CountRow key={format.id} countId={count.id} areaId={areaId} format={format}
                                        total={totals.units.get(format.id) ?? 0} locked={locked} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
            {/* FIXME: let each product belong to certain areas, so each tab only lists what's kept there */}
        </div>
    );
}


// One product on the count sheet for one area
interface RowProps {
    countId: string;
    areaId: string | null;
    format: Format;
    total: number;
    locked: boolean;
}

function CountRow({ countId, areaId, format, total, locked }: RowProps) {
    const line = findCountLine(countId, areaId, format.id);
    const size = caseSize(format.id);
    const cases = line?.cases ?? 0;
    const units = line?.units ?? 0;
    const word = unitWord(format);

    return (
        <tr className={line ? "counted" : ""}>
            <td>
                <strong>{formatLabel(format)}</strong>
                {size > 1 && <div className="muted small">case = {size} {word}s</div>}
            </td>
            <td>
                {size === 1 ? <span className="muted">—</span>
                    : locked ? formatAmount(cases)
                    : <AmountInput value={line ? cases : null} allowBlank placeholder="0" className="qty-input" ariaLabel="Cases"
                        onSave={(v) => setCount(countId, areaId, format.id, v ?? 0, units)} />}
            </td>
            <td>
                {/* A finished count is shown, not edited (Reopen it to change) */}
                {locked ? formatAmount(units)
                    : <AmountInput value={line ? units : null} allowBlank placeholder="0" className="qty-input" ariaLabel={"Loose " + word + "s"}
                        onSave={(v) => setCount(countId, areaId, format.id, cases, v ?? 0)} />}
                <span className="muted small"> {word}s</span>
            </td>
            <td className="num hide-phone">{line ? formatAmount(lineUnits(line)) : "—"}</td>
            <td className="num hide-phone">{total > 0 ? formatAmount(total) : "—"}</td>
        </tr>
    );
}


// Totals across all areas, against par, with value
function SummaryTable({ formats, totals }: { formats: Format[]; totals: Map<string, number> }) {
    let grand = 0;
    return (
        <section className="card table-card">
            <div className="table-scroll">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th className="num">Counted</th>
                            <th className="num">Par</th>
                            <th className="num">Cost each</th>
                            <th className="num">Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formats.map((format) => {
                            const have = totals.get(format.id) ?? 0;
                            const cost = unitCost(format.id);
                            const value = cost === null ? null : have * cost;
                            if (value !== null) grand += value;
                            const low = format.par !== null && have < format.par;
                            return (
                                <tr key={format.id}>
                                    <td><Link to={"/products/" + format.productId}>{formatLabel(format)}</Link></td>
                                    <td className={"num" + (low ? " warn" : "")}>{formatAmount(have)} {unitWord(format)}s</td>
                                    <td className="num">{format.par === null ? "—" : formatAmount(format.par)}</td>
                                    <td className="num">{cost === null ? "—" : formatMoney(cost)}</td>
                                    <td className="num">{value === null ? "—" : formatMoney(value)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={4}><strong>Total value</strong></td>
                            <td className="num"><strong>{formatMoney(grand)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </section>
    );
}
