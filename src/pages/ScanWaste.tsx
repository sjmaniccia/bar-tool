// ===== ScanWaste.tsx =====
// Scan the paper waste log (the sheet by the well) instead of typing every line.
//
//     1. PHOTOS   1 to 4 photos of the sheet
//     2. READ     Agave's server reads every line (scan-waste function)
//     3. CHECK    one line each, like the invoice: "2 × Margarita · Comp · Nov 27" and a pencil
//                 that opens it (what it was, how many, why, when, note)
//                 lines it couldn't match start unticked with "pick one"
//     4. LOG      the ticked lines go in the waste log, the same as logging by hand
// Staff can do this too: they keep the waste log.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { useSession } from "../cloud/session";
import { MAX_PAGES, scanWaste, shrinkPhoto } from "../cloud/scan";
import { buildWasteDrafts, itemLabel, productQuantity, saveWasteDrafts, type WasteDraft } from "../data/wasteScan";
import PencilIcon from "../components/PencilIcon";
import { formatLabel } from "../data/inventory";
import { today, formatAmount, parseAmount } from "../data/utils";
import type { WasteReason } from "../data/types";
import PhotoPicker from "../components/PhotoPicker";
import { plural } from "../data/lineText";
import { toast } from "../feedback";

const REASONS: { value: WasteReason; label: string }[] = [
    { value: "spill", label: "Spill" },
    { value: "comp", label: "Comp" },
    { value: "returned", label: "Sent back" },
    { value: "breakage", label: "Broken" },
    { value: "expired", label: "Expired" },
    { value: "other", label: "Other" }
];

// "2 bottles Highland blanco", as it was on the sheet
function writtenText(d: WasteDraft): string {
    const w = d.written;
    return formatAmount(w.quantity) + (w.unit ? " " + plural(w.unit, w.quantity) : "") + " " + w.item + (w.note ? " · " + w.note : "");
}

// "Highland Blanco Tequila · 750 ml bottle" -> "Highland Blanco Tequila 750 ml" (fits one line)
function shortName(label: string): string {
    return label.replace(" · ", " ").replace(/ (bottle|bag|can|box|jar|keg)$/, "");
}

// "2026-11-27" -> "Nov 27"
function shortDate(date: string): string {
    const d = new Date(date + "T12:00:00");
    return isNaN(d.getTime()) ? date : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ScanWaste() {
    const db = useDb();
    const navigate = useNavigate();
    const session = useSession();
    const barId = session.mode === "ready" ? session.bar?.id ?? null : null;
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [warnings, setWarnings] = useState<string[]>([]);
    const [drafts, setDrafts] = useState<WasteDraft[] | null>(null);
    const [openKey, setOpenKey] = useState<string | null>(null);     // the one line being edited

    const recipes = useMemo(() => db.recipes.filter((r) => r.type !== "Prep").sort((a, b) => a.name.localeCompare(b.name)), [db.recipes]);
    const formats = useMemo(() => db.formats.map((f) => ({ f, label: formatLabel(f) })).sort((a, b) => a.label.localeCompare(b.label)), [db.formats]);

    if (!barId) {
        return (
            <div className="page">
                <h1>Scan a waste log</h1>
                <section className="card card-pad-all"><p>Sign in to scan. You can still <Link to="/waste">log waste by hand</Link>.</p></section>
            </div>
        );
    }

    async function read() {
        setBusy(true);
        setError("");
        try {
            const pages = [];
            for (const file of files) pages.push(await shrinkPhoto(file));
            const reply = await scanWaste(barId!, pages);
            if (!reply.ok) setError(reply.error);
            else {
                setDrafts(buildWasteDrafts(reply.lines, today()));
                setWarnings(reply.warnings);
            }
        } catch (e) {
            setError("Couldn't read that photo: " + (e instanceof Error ? e.message : String(e)));
        }
        setBusy(false);
    }

    const set = (key: string, change: Partial<WasteDraft>) =>
        setDrafts((all) => all!.map((d) => (d.key === key ? { ...d, ...change } : d)));

    // Picking what it was: "recipe:<id>" or "product:<id>"; a product's ounces become part of a bottle
    function pick(d: WasteDraft, value: string) {
        const [kind, id] = value.split(":") as ["recipe" | "product", string];
        if (!id) return set(d.key, { itemId: "", include: false });
        const quantity = kind === "product" ? productQuantity(d.written, id) : d.written.quantity;
        set(d.key, { kind, itemId: id, include: true, quantity });
    }

    function save() {
        const n = saveWasteDrafts(drafts!);
        toast(n === 1 ? "1 line logged" : n + " lines logged", { sub: "Taken out of the variance.", sound: "tick" });
        navigate("/waste");
    }

    // ===== Photos =====
    if (drafts === null) {
        return (
            <div className="page">
                <Link to="/waste" className="back">← Waste log</Link>
                <div className="page-header">
                    <div>
                        <h1>Scan a waste log</h1>
                        <p className="muted">Take a photo of the sheet. Agave reads every line, and you check them before they're logged.</p>
                    </div>
                </div>
                <section className="card scan-card">
                    <PhotoPicker files={files} onChange={setFiles} onReject={setError} max={MAX_PAGES} disabled={busy} pageWord="Sheet" />
                    {error && <p className="error" role="alert">{error}</p>}
                    <div className="button-row">
                        <button disabled={busy || files.length === 0} onClick={() => void read()}>{busy ? "Reading the sheet…" : "Read the sheet"}</button>
                        {busy && <span className="muted small">Usually 10 to 20 seconds.</span>}
                    </div>
                </section>
            </div>
        );
    }

    // ===== Check =====
    const ready = drafts.filter((d) => d.include && d.itemId && d.quantity > 0).length;
    const unmatched = drafts.filter((d) => !d.itemId).length;
    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Check the waste log</h1>
                    <p className="muted">{drafts.length} lines read{unmatched > 0 ? " · " + unmatched + " to pick" : ""}. Untick anything that shouldn't be logged.</p>
                </div>
            </div>
            {warnings.map((w) => <p key={w} className="warn small">{w}</p>)}

            <ul className="card waste-scan-list">
                {drafts.map((d) => {
                    const name = itemLabel(d.kind, d.itemId);
                    const qty = d.kind === "product" ? formatAmount(d.quantity) + " × " : d.quantity !== 1 ? formatAmount(d.quantity) + " × " : "";
                    const open = openKey === d.key;
                    return (
                        <li key={d.key} className={"waste-scan-line" + (d.include ? "" : " left-out") + (open ? " open" : "")}>
                            {/* One line: tick, what (or what was written), how many, why, when, pencil */}
                            <div className="waste-row">
                                <input type="checkbox" checked={d.include} disabled={!d.itemId} aria-label={"Log " + d.written.item}
                                    onChange={(e) => set(d.key, { include: e.target.checked })} />
                                <span className="waste-row-text" title={"Written: " + writtenText(d)}>
                                    {d.itemId ? <>{qty}<strong>{shortName(name)}</strong></> : <em>{writtenText(d)}</em>}
                                </span>
                                {!d.itemId
                                    ? <button type="button" className="tag warn-tag count-check" onClick={() => setOpenKey(d.key)}>pick one</button>
                                    : <span className="muted small waste-row-meta">{REASONS.find((r) => r.value === d.reason)?.label} · {shortDate(d.date)}</span>}
                                <button type="button" className="pencil" aria-label={"Edit " + d.written.item} aria-expanded={open}
                                    onClick={() => setOpenKey(open ? null : d.key)}><PencilIcon /></button>
                            </div>
                            {open && (
                                <div className="line-editor">
                                    <p className="muted small line-editor-wide waste-written-note">Written: {writtenText(d)}</p>
                                    <label className="line-editor-wide"><span className="small muted">What it was</span>
                                        <select value={d.itemId ? d.kind + ":" + d.itemId : ""} onChange={(e) => pick(d, e.target.value)}>
                                            <option value="">Pick a drink, dish or product…</option>
                                            <optgroup label="Drinks & dishes">
                                                {recipes.map((r) => <option key={r.id} value={"recipe:" + r.id}>{r.name}</option>)}
                                            </optgroup>
                                            <optgroup label="Products">
                                                {formats.map(({ f, label }) => <option key={f.id} value={"product:" + f.id}>{label}</option>)}
                                            </optgroup>
                                        </select></label>
                                    <label><span className="small muted">{d.kind === "product" ? "How many (bottles…)" : "How many"}</span>
                                        <input className="qty-input" inputMode="decimal" defaultValue={formatAmount(d.quantity)} key={d.itemId}
                                            onBlur={(e) => { const q = parseAmount(e.target.value); if (q > 0) set(d.key, { quantity: q }); }} /></label>
                                    <label><span className="small muted">Reason</span>
                                        <select value={d.reason} onChange={(e) => set(d.key, { reason: e.target.value as WasteReason })}>
                                            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                        </select></label>
                                    <label><span className="small muted">Date</span>
                                        <input type="date" value={d.date} onChange={(e) => set(d.key, { date: e.target.value })} /></label>
                                    <label className="line-editor-wide"><span className="small muted">Note</span>
                                        <input value={d.note} onChange={(e) => set(d.key, { note: e.target.value })} /></label>
                                    <div className="line-editor-actions line-editor-wide">
                                        <button type="button" className="link-button danger-link" onClick={() => { set(d.key, { include: false }); setOpenKey(null); }}>Leave it off</button>
                                        <button type="button" onClick={() => setOpenKey(null)}>Done</button>
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            <div className="button-row">
                <button disabled={ready === 0} onClick={save}>Log {ready} {ready === 1 ? "line" : "lines"}</button>
                <button className="secondary" onClick={() => { setDrafts(null); setFiles([]); }}>Start over</button>
            </div>
        </div>
    );
}
