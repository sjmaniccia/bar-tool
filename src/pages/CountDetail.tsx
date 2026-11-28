// ===== CountDetail.tsx =====
// One stock count, done area by area like walking the bar with a clipboard:
//     one tab per area: type unopened cases + loose units for each product
//     Summary tab: totals across areas, against par, with the value
// Finishing the count makes it the "on hand" used by products and ordering.
//
// Faster counting:
//     OPEN BOTTLES   tap the bottle drawing to add a partial (in tenths)
//     BARCODES       a scanner types the code into search + Enter -> adds one of that product here
//     CAMERA         same thing with the phone camera, where the browser supports it

import { Fragment, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDb } from "../data/storage";
import {
    caseSize, countTimeLabel, countTotals, deleteCount, findCountLine, finishCount, formatLabel, guessCountTime, lineUnits, notCounted,
    setCount, unitCost, unitWord, updateCount
} from "../data/inventory";
import { FAMILIES } from "../data/library";
import { findById, formatAmount, formatDate, formatMoney } from "../data/utils";
import { familyOf } from "../data/units";
import type { CountTime, Format } from "../data/types";
import Sheet from "../components/Sheet";
import TextInput from "../components/TextInput";
import AmountInput from "../components/AmountInput";
import Status from "../components/Status";
import FillPicker from "../components/FillPicker";
import BarcodeScanner, { cameraScanAvailable } from "../components/BarcodeScanner";
import { celebrate, toast } from "../feedback";

const SUMMARY = "summary";

export default function CountDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { countId } = useParams();
    const count = findById(db.stockCounts, countId ?? null);
    const [tab, setTab] = useState<string>(db.areas[0]?.id ?? "none");
    const [search, setSearch] = useState("");
    const [family, setFamily] = useState("");
    const [pickerFor, setPickerFor] = useState<string | null>(null);   // which row's bottle picker is open
    const [scanning, setScanning] = useState(false);
    const [scanNote, setScanNote] = useState<{ text: string; ok: boolean } | null>(null);
    const [flashId, setFlashId] = useState<string | null>(null);       // the row just scanned, highlighted
    const [finishing, setFinishing] = useState(false);

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
        .filter(({ format, product }) => wanted === "" || product!.name.toLowerCase().includes(wanted) || (format.barcode !== "" && format.barcode === wanted))
        .filter(({ product }) => family === "" || product!.family === family)
        .sort((a, b) => a.product!.family.localeCompare(b.product!.family) || a.product!.name.localeCompare(b.product!.name));

    // A barcode was scanned (by a scanner typing into search, or the camera)
    //     IF the count is finished, or we're on the Summary tab, say so
    //     IF no format has that barcode, say how to add it
    //     ELSE add one loose unit of it in this area, and highlight the row
    function scan(code: string) {
        const trimmed = code.trim();
        if (trimmed === "") return;
        const format = db.formats.find((f) => f.barcode !== "" && f.barcode === trimmed) ?? null;
        if (locked) return setScanNote({ text: "This count is finished. Reopen it to keep counting.", ok: false });
        if (tab === SUMMARY) return setScanNote({ text: "Pick an area tab first, then scan.", ok: false });
        if (format === null) {
            return setScanNote({ text: "No product has barcode " + trimmed + ". Add it to the product's format, then scan again.", ok: false });
        }
        const line = findCountLine(count!.id, areaId, format.id);
        const units = (line?.units ?? 0) + 1;
        setCount(count!.id, areaId, format.id, line?.cases ?? 0, units);
        setSearch("");
        setFlashId(format.id);
        setScanNote({ text: formatLabel(format) + ": " + formatAmount(units) + " loose here", ok: true });
    }

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
                        <span className="tag">{locked ? formatDate(count.countedAt) + " · " + countTimeLabel(count) : "started " + formatDate(count.countedAt)}</span>
                        <span className="tag house">{formatMoney(totals.value)}</span>
                    </div>
                </div>
                <div className="button-row">
                    {locked
                        ? <button className="secondary" onClick={() => updateCount(count.id, { status: "open" })}>Reopen</button>
                        : <button onClick={() => setFinishing(true)}>Finish count</button>}
                    <button className="secondary" onClick={() => window.print()}>Print</button>
                    <button className="danger" onClick={remove}>Delete</button>
                </div>
            </div>

            {!locked && (
                <section className="card no-print">
                    <div className="form-grid">
                        <label className="form-field"><span>Name</span>
                            <TextInput value={count.name} required onSave={(name) => updateCount(count.id, { name })} /></label>
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

            {finishing && <FinishSheet countId={count.id} onClose={() => setFinishing(false)} />}

            <div className="toolbar no-print">
                <input type="search" placeholder="Search or scan a barcode…" value={search} aria-label="Search or scan"
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && /^\d{6,}$/.test(search.trim())) scan(search); }} />
                {!locked && cameraScanAvailable() && !scanning && (
                    <button className="secondary" onClick={() => setScanning(true)}>Scan with camera</button>
                )}
                <label className="inline-label">
                    Family
                    <select value={family} onChange={(e) => setFamily(e.target.value)}>
                        <option value="">All</option>
                        {FAMILIES.map((f) => <option key={f}>{f}</option>)}
                    </select>
                </label>
            </div>

            {scanNote && <p className={"scan-note no-print " + (scanNote.ok ? "success" : "error")} role="status">{scanNote.text}</p>}
            {scanning && <BarcodeScanner onScan={scan} onClose={() => setScanning(false)} />}

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
                                        total={totals.units.get(format.id) ?? 0} locked={locked} flash={flashId === format.id}
                                        pickerOpen={pickerFor === format.id}
                                        onPicker={(open) => setPickerFor(open ? format.id : null)} />
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
    flash: boolean;                       // just scanned
    pickerOpen: boolean;
    onPicker: (open: boolean) => void;
}

function CountRow({ countId, areaId, format, total, locked, flash, pickerOpen, onPicker }: RowProps) {
    const line = findCountLine(countId, areaId, format.id);
    const size = caseSize(format.id);
    const cases = line?.cases ?? 0;
    const units = line?.units ?? 0;
    const word = unitWord(format);
    // Split loose units into full bottles + the open one: 3.4 -> 3 full, 0.4 open
    const whole = Math.floor(units + 0.001);
    const open = Math.round((units - whole) * 10) / 10;
    // Only liquids come in partial bottles (not "each" limes)
    const pourable = familyOf(format.sizeUnit) === "volume";

    return (
        <Fragment>
        <tr className={(line ? "counted" : "") + (flash ? " just-scanned" : "")}>
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
                {pourable && !locked && (
                    <button className={"open-bottle" + (open > 0 ? " has-open" : "")} aria-label="Open bottle level" aria-expanded={pickerOpen}
                        onClick={() => onPicker(!pickerOpen)}>
                        <MiniBottle level={open} />{open > 0 ? "." + Math.round(open * 10) : "+ open"}
                    </button>
                )}
            </td>
            <td className="num hide-phone">{line ? formatAmount(lineUnits(line)) : "—"}</td>
            <td className="num hide-phone">{total > 0 ? formatAmount(total) : "—"}</td>
        </tr>
        {pickerOpen && (
            <tr className="picker-row">
                <td colSpan={5}>
                    <FillPicker value={open}
                        onPick={(level) => setCount(countId, areaId, format.id, cases, whole + level)}
                        onClose={() => onPicker(false)} />
                </td>
            </tr>
        )}
        </Fragment>
    );
}

// A tiny bottle icon filled to the open bottle's level
function MiniBottle({ level }: { level: number }) {
    return (
        <svg viewBox="0 0 12 20" className="mini-bottle" aria-hidden="true">
            <rect x="2" y={18 - level * 12} width="8" height={level * 12} className="mini-liquid" />
            <path d="M4.5 1 h3 v4 l2.5 3 v10 h-8 v-10 l2.5 -3 z" className="mini-outline" />
        </svg>
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
                                    <td className={"num" + (low ? " warn" : "")}>{formatAmount(have)} {unitWord(format)}{have === 1 ? "" : "s"}</td>
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


// Finishing: when was it counted, and was anything skipped?
//     The time decides which side of the count that day's sales and deliveries land on.
//     Anything skipped counts as 0, so ask before it shows up as "missing" in the variance report.
function FinishSheet({ countId, onClose }: { countId: string; onClose: () => void }) {
    const db = useDb();
    const guess = guessCountTime();
    const [day, setDay] = useState(guess.day);
    const [when, setWhen] = useState<CountTime>(guess.when);
    const skipped = notCounted(countId).map((id) => findById(db.formats, id)).filter((f) => f !== null);

    function finish() {
        finishCount(countId, day, when);
        celebrate("big");
        toast("Count finished", { sub: "On-hand and inventory value are up to date." });
        onClose();
    }

    return (
        <Sheet title="Finish the count" onClose={onClose}>
            <p className="muted small">When did you count? That day's sales and deliveries go on the right side of it.</p>
            <div className="choice-pair" role="radiogroup" aria-label="When">
                <button type="button" role="radio" aria-checked={when === "open"} className={"choice" + (when === "open" ? " picked" : "")} onClick={() => setWhen("open")}>
                    <strong>Before opening</strong><span className="muted small">sales today come after</span>
                </button>
                <button type="button" role="radio" aria-checked={when === "close"} className={"choice" + (when === "close" ? " picked" : "")} onClick={() => setWhen("close")}>
                    <strong>After closing</strong><span className="muted small">sales today come before</span>
                </button>
            </div>
            <label className="form-field"><span>Business day</span>
                <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
            {/* After midnight, tonight still belongs to yesterday until 5am */}
            {guess.lateNight && day === guess.day && (
                <p className="muted small late-night-note">Marked as yesterday ({new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}). It's after midnight, so this counts toward last night until 5am.</p>
            )}

            {skipped.length > 0 && (
                <div className="skipped">
                    <strong>{skipped.length} {skipped.length === 1 ? "thing wasn't" : "things weren't"} counted</strong>
                    <p className="muted small">You had {skipped.length === 1 ? "it" : "these"} last time or got a delivery since. Not counted means 0, which looks like it all went missing.</p>
                    <ul className="skipped-list">
                        {skipped.slice(0, 8).map((f) => <li key={f!.id}>{formatLabel(f!)}</li>)}
                        {skipped.length > 8 && <li className="muted">and {skipped.length - 8} more</li>}
                    </ul>
                </div>
            )}

            <div className="button-row sheet-buttons">
                <button className="secondary" onClick={onClose}>Keep counting</button>
                <button onClick={finish}>{skipped.length > 0 ? "They're gone, finish" : "Finish count"}</button>
            </div>
        </Sheet>
    );
}
