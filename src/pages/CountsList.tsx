// ===== CountsList.tsx =====
// Stock counts and the storage areas they're counted in.
// A count can be any day: it's a snapshot, taken before opening or after closing.
// The latest CLOSED count is what "on hand" means everywhere else (products, ordering).

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { byCountTime, countTimeLabel, countTotals, createArea, createCount, deleteArea, latestClosedCount, renameArea } from "../data/inventory";
import { formatMoney, today } from "../data/utils";
import TextInput from "../components/TextInput";
import { useSession } from "../cloud/session";
import { canEdit } from "../cloud/access";

export default function CountsList() {
    const db = useDb();
    const managing = canEdit(useSession().bar?.role ?? null);   // staff count, managers set up areas
    const navigate = useNavigate();
    const counts = [...db.stockCounts].sort((a, b) => byCountTime(b, a));
    const open = counts.filter((c) => c.status === "open");
    const latest = latestClosedCount();
    const [showAreas, setShowAreas] = useState(false);

    function startCount() {
        // IF a count is already going, keep going on it (one count at a time keeps the numbers clean)
        if (open.length > 0) return navigate("/counts/" + open[0].id);
        navigate("/counts/" + createCount("Count"));
    }

    return (
        <div className="page menu-page tile-page">
            <div className="page-header">
                <div>
                    <h1>Counts</h1>
                    <p className="muted">A count is a snapshot of every bottle on the shelf. Count everything, any day, before you open or after you close.</p>
                </div>
                <button className="icon-circle new-circle" aria-label={open.length ? "Continue the count" : "Start a count"} title={open.length ? "Continue the count" : "Start a count"} onClick={startCount}>+</button>
            </div>

            {/* The count in progress, front and center */}
            {open.map((count) => (
                <Link key={count.id} to={"/counts/" + count.id} className="card count-going">
                    <span className="count-going-dot" aria-hidden="true" />
                    <span className="menu-list-name">
                        <strong>{count.name} in progress</strong>
                        <span className="muted small">{countTotals(count.id).units.size} items counted so far · tap to keep going</span>
                    </span>
                    <span className="chevron" aria-hidden="true">›</span>
                </Link>
            ))}

            <div className="mini-stats">
                <div><span className="muted small">On the shelf</span><strong>{latest ? formatMoney(countTotals(latest.id).value) : "—"}</strong></div>
                <div><span className="muted small">Last count</span><strong>{latest ? daysSince(latest.countedAt) : "—"}</strong></div>
                <div><span className="muted small">Counts</span><strong>{counts.length - open.length}</strong></div>
            </div>

            <WhyCount />

            {counts.length === open.length ? (
                <section className="card empty">No finished counts yet. Tap + to start one, or load sample data from the <Link to="/dashboard">Dashboard</Link>.</section>
            ) : (
                <ul className="card menu-lines">
                    {counts.filter((c) => c.status === "closed").map((count) => {
                        const totals = countTotals(count.id);
                        return (
                            <li key={count.id} className="menu-line">
                                <Link to={"/counts/" + count.id} className="menu-line-row menu-list-row">
                                    <DayTile day={count.countedAt} />
                                    <span className="menu-list-name">
                                        <strong>{shortDay(count.countedAt)}</strong>
                                        <span className="muted small">{countTimeLabel(count)} · {totals.units.size} items</span>
                                    </span>
                                    <span className="menu-line-nums">{formatMoney(totals.value)}</span>
                                    <span className="chevron" aria-hidden="true">›</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}

            {managing && (
                <>
                    <button className="link-button areas-toggle" aria-expanded={showAreas} onClick={() => setShowAreas(!showAreas)}>
                        <PencilIcon /> Storage areas: {db.areas.map((a) => a.name).join(", ") || "none yet"}
                    </button>
                    {showAreas && <AreasCard />}
                </>
            )}
        </div>
    );
}

// Why bother counting? Short, and folded away once you know
function WhyCount() {
    const [open, setOpen] = useState(false);
    return (
        <section className="card why-count">
            <button className="why-count-head" aria-expanded={open} onClick={() => setOpen(!open)}>
                <span>Why count?</span><span className="chevron" aria-hidden="true">{open ? "⌄" : "›"}</span>
            </button>
            {open && (
                <ul className="why-list">
                    <li><strong>Find what's missing.</strong> Two counts, plus the invoices and sales in between, show what you poured vs. what you rang in. The gap is overpours, comps nobody logged, and theft.</li>
                    <li><strong>Your real pour cost.</strong> Not what the recipes say it should be: what it actually was.</li>
                    <li><strong>Order the right amount.</strong> On-hand comes from your last count, so suggested orders are only as good as it is.</li>
                    <li><strong>Know what's on the shelf.</strong> Inventory value for the books, insurance, or selling the bar.</li>
                    <li><strong>Any day works.</strong> Just count everything, and count when nothing is selling: before you open or after you close.</li>
                </ul>
            )}
        </section>
    );
}

// "Sun, Nov 15"
function shortDay(day: string): string {
    return new Date(day.slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// "today", "1d ago", "13d ago"
function daysSince(day: string): string {
    const days = Math.round((new Date(today() + "T12:00:00").getTime() - new Date(day.slice(0, 10) + "T12:00:00").getTime()) / 86400000);
    if (days <= 0) return "today";
    return days + "d ago";
}

// A little calendar page: "NOV" over "15"
function DayTile({ day }: { day: string }) {
    const d = new Date(day.slice(0, 10) + "T12:00:00");
    return (
        <span className="day-tile" aria-hidden="true">
            <span>{d.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span>
            <strong>{d.getDate()}</strong>
        </span>
    );
}

function PencilIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
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
