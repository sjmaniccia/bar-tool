// ===== ScanInvoice.tsx =====
// Snap the invoice, check the lines, done.
//
//     1. PHOTOS   take or choose up to 4 photos (one per page)
//     2. READ     the server has Claude read them (10-30 seconds)
//     3. CHECK    each line is matched to a product where Agave can:
//                     "remembered"  matched the same way last time
//                     "item code"   the vendor's code is on the product
//                     "check"       a guess from the name and size: look at it
//                     "pick one"    no idea; pick a product, add it as new, or skip it
//                 and the line total is checked against the printed total
//     4. CREATE   makes a normal draft invoice and opens it. Approving it there records
//                 the prices and shows which recipes changed cost.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { useSession } from "../cloud/session";
import { limitReached, MAX_PAGES, scanInvoice, scanUsage, shrinkPhoto, type ScanUsage } from "../cloud/scan";
import {
    addUnmatchedAsProducts, buildDraft, createInvoiceFromDraft, createProductFromLine, ensureVendor, rematch, unitLabel, unmatchedLines, vendorDisplayName,
    type Draft, type DraftLine, type MatchHow
} from "../data/invoiceScan";
import { formatMoney, parseAmount } from "../data/utils";

const NEW_PRODUCT = "__new";
const SKIP = "__skip";

const HOW_TAG: Record<MatchHow, { text: string; className: string; title: string }> = {
    remembered: { text: "remembered", className: "tag house", title: "Matched the same way on an earlier invoice from this vendor" },
    code: { text: "item code", className: "tag house", title: "The vendor's item code is saved on this product" },
    suggested: { text: "check", className: "tag", title: "A guess from the name and size. Make sure it's right." },
    picked: { text: "matched", className: "tag house", title: "You picked this. Agave will remember it for this vendor." },
    none: { text: "pick one", className: "tag warn-tag", title: "Pick the product, add it as new, or skip the line" }
};

export default function ScanInvoice() {
    const db = useDb();
    const session = useSession();
    const navigate = useNavigate();
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [draft, setDraft] = useState<Draft | null>(null);
    const [printed, setPrinted] = useState<{ subtotal: number | null; total: number | null }>({ subtotal: null, total: null });
    const [warnings, setWarnings] = useState<string[]>([]);
    const [usage, setUsage] = useState<ScanUsage | null>(null);
    const barId = session.mode === "ready" ? session.bar?.id ?? null : null;

    // How many scans this bar has left (shown before taking photos)
    useEffect(() => {
        if (!barId) return;
        let current = true;
        void scanUsage(barId).then((u) => { if (current) setUsage(u); });
        return () => { current = false; };
    }, [barId]);

    // Thumbnails for the chosen photos (freed when they change)
    const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
    useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

    if (!barId) {
        return (
            <div className="page">
                <h1>Scan an invoice</h1>
                <section className="card card-pad-all">
                    <p>Sign in to scan invoices. The photos are read on Agave's server, which the demo doesn't use.</p>
                    <p className="muted small">You can still <Link to="/invoices">enter an invoice by hand</Link>.</p>
                </section>
            </div>
        );
    }
    const atLimit = limitReached(usage);

    function addFiles(list: FileList | null) {
        if (!list) return;
        const images = [...list].filter((f) => f.type.startsWith("image/"));
        setFiles((current) => [...current, ...images].slice(0, MAX_PAGES));
        setError(images.length < list.length ? "Only photos can be scanned (a PDF can be screenshotted)." : "");
    }

    async function read() {
        setBusy(true);
        setError("");
        try {
            const pages = [];
            for (const file of files) pages.push(await shrinkPhoto(file));
            const reply = await scanInvoice(barId!, pages);
            if (reply.usage) setUsage(reply.usage);
            if (!reply.ok) {
                setError(reply.error);
            } else {
                setDraft(buildDraft(reply.invoice));
                setPrinted({ subtotal: reply.invoice.subtotal, total: reply.invoice.total });
                setWarnings(reply.warnings);
            }
        } catch (e) {
            setError("Couldn't read that photo: " + (e instanceof Error ? e.message : String(e)));
        }
        setBusy(false);
    }

    // ===== Step 1: photos =====
    if (!draft) {
        return (
            <div className="page">
                <div className="page-header">
                    <div>
                        <h1>Scan an invoice</h1>
                        <p className="muted">Take a photo of each page. Flat, in good light, with the whole page in the frame.</p>
                    </div>
                </div>

                <section className="card scan-card">
                    <label className="scan-drop">
                        <input
                            type="file" accept="image/*" capture="environment" multiple hidden
                            disabled={busy || files.length >= MAX_PAGES}
                            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                        />
                        <span className="scan-drop-icon" aria-hidden="true">📷</span>
                        <strong>{files.length === 0 ? "Take or choose photos" : "Add another page"}</strong>
                        <span className="muted small">Up to {MAX_PAGES} pages</span>
                    </label>

                    {files.length > 0 && (
                        <div className="scan-thumbs">
                            {previews.map((url, i) => (
                                <figure key={url} className="scan-thumb">
                                    <img src={url} alt={"Page " + (i + 1)} />
                                    <figcaption>
                                        Page {i + 1}
                                        <button className="link-button" disabled={busy} onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
                                    </figcaption>
                                </figure>
                            ))}
                        </div>
                    )}

                    {(error || atLimit) && <p className="error" role="alert">{error || atLimit}</p>}
                    <div className="button-row">
                        <button disabled={busy || files.length === 0 || atLimit !== null} onClick={read}>
                            {busy ? "Reading the invoice…" : "Read invoice"}
                        </button>
                        {busy && <span className="muted small">Usually 10 to 30 seconds.</span>}
                        {!busy && usage && (
                            <span className="muted small scan-usage">
                                {usage.month} of {usage.monthlyLimit} scans used this month · {usage.today} of {usage.dailyLimit} today
                            </span>
                        )}
                    </div>
                </section>
                <p className="muted small">
                    The photos go to Agave's server and to Claude (Anthropic) to be read, then they're thrown away.
                    Nothing is saved until you press Create invoice.
                </p>
            </div>
        );
    }

    // ===== Step 2: check =====
    const d = draft;
    const vendorUnits = db.purchaseUnits.filter((u) => u.vendorId === d.vendorId);
    const otherUnits = db.purchaseUnits.filter((u) => u.vendorId !== d.vendorId);
    const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
    const vendorOptions = vendorUnits.map((u) => ({ id: u.id, label: unitLabel(u) })).sort(byLabel);
    const otherOptions = otherUnits.map((u) => ({ id: u.id, label: unitLabel(u) })).sort(byLabel);

    const used = d.lines.filter((l) => !l.skip && l.purchaseUnitId);
    const open = d.lines.filter((l) => !l.skip && !l.purchaseUnitId);
    const entered = used.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    const allLines = d.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice * (l.scanned.kind === "credit" ? -1 : 1), 0);

    function setLine(index: number, change: Partial<DraftLine>) {
        setDraft({ ...d, lines: d.lines.map((l, i) => (i === index ? { ...l, ...change } : l)) });
    }

    function pick(index: number, value: string) {
        if (value === SKIP) return setLine(index, { skip: true, purchaseUnitId: null });
        if (value === NEW_PRODUCT) {
            // A new product needs a vendor to buy it from: add the vendor now if it's new
            const vendorId = ensureVendor(d);
            const unitId = createProductFromLine({ ...d.lines[index].scanned, unitPrice: d.lines[index].unitPrice }, vendorId);
            setDraft({
                ...d, vendorId,
                lines: d.lines.map((l, i) => (i === index ? { ...l, skip: false, purchaseUnitId: unitId, how: "picked" } : l))
            });
            if (!unitId) setError("Couldn't add that product. Add it on the Products page, then pick it here.");
            return;
        }
        setLine(index, { skip: false, purchaseUnitId: value || null, how: value ? "picked" : "none" });
    }

    const unmatched = unmatchedLines(d);

    function addAll() {
        const { draft: next, added } = addUnmatchedAsProducts(d);
        setDraft(next);
        if (added < unmatched.length) setError("Some lines couldn't be added. Pick a product for them, or skip them.");
    }

    function create() {
        if (open.length > 0 && !confirm(open.length + (open.length === 1 ? " line has" : " lines have") + " no product and won't be entered. Create the invoice anyway?")) return;
        navigate("/invoices/" + createInvoiceFromDraft(d));
    }

    const printedTarget = printed.subtotal ?? printed.total;
    const off = printedTarget !== null && Math.abs(allLines - printedTarget) > 0.05;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Check the invoice</h1>
                    <p className="muted">Fix anything Claude misread, match each line to a product, then create the invoice.</p>
                </div>
                <div className="button-row">
                    <button className="secondary" onClick={() => { setDraft(null); setWarnings([]); }}>Start over</button>
                    <button onClick={create} disabled={used.length === 0}>Create invoice</button>
                </div>
            </div>

            <section className="card scan-head">
                <label>
                    <span className="small muted">Vendor</span>
                    <select
                        value={d.vendorId ?? ""}
                        onChange={(e) => setDraft(rematch(d, e.target.value || null))}
                    >
                        <option value="">{"New vendor: " + vendorDisplayName(d.vendorName)}</option>
                        {db.vendors.map((v) => <option key={v.id} value={v.id}>{v.companyName}</option>)}
                    </select>
                    {d.vendorName && <span className="muted small">Printed: {d.vendorName}</span>}
                </label>
                <label>
                    <span className="small muted">Invoice #</span>
                    <input value={d.number} onChange={(e) => setDraft({ ...d, number: e.target.value })} />
                </label>
                <label>
                    <span className="small muted">Date</span>
                    <input type="date" value={d.date} onChange={(e) => setDraft({ ...d, date: e.target.value })} />
                </label>
            </section>

            {(warnings.length > 0 || error) && (
                <section className="card warn-box card-pad-all" role="status">
                    <strong>Double-check these</strong>
                    <ul className="scan-warnings">
                        {warnings.map((w) => <li key={w}>{w}</li>)}
                        {error && <li>{error}</li>}
                    </ul>
                </section>
            )}

            {unmatched.length > 0 && (
                <section className="card scan-fill">
                    <div>
                        <strong>{unmatched.length} {unmatched.length === 1 ? "item isn't" : "items aren't"} in Agave yet.</strong>
                        <span className="muted small">
                            {" "}Add {unmatched.length === 1 ? "it" : "them"} as new products: name, bottle size, case size and this price
                            {d.vendorId ? "" : ", plus " + vendorDisplayName(d.vendorName) + " as a vendor"}.
                            Check a few on the Products page afterward.
                        </span>
                    </div>
                    <button onClick={addAll}>+ Add {unmatched.length} as new products</button>
                </section>
            )}

            <section className="card table-card">
                <table className="table scan-table">
                    <thead>
                        <tr><th>On the invoice</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th><th>Product</th></tr>
                    </thead>
                    <tbody>
                        {d.lines.map((line, i) => {
                            const s = line.scanned;
                            const tag = line.skip ? null : HOW_TAG[line.purchaseUnitId ? line.how : "none"];
                            return (
                                <tr key={i} className={line.skip ? "scan-skipped" : ""}>
                                    <td>
                                        <div>{s.description}</div>
                                        <div className="muted small">
                                            {[s.sku && "#" + s.sku, s.packSize, s.unit, s.kind !== "item" && s.kind].filter(Boolean).join(" · ")}
                                        </div>
                                        {s.warning && <div className="warn small">{s.warning}</div>}
                                    </td>
                                    <td className="num">
                                        <input className="qty-input" inputMode="decimal" aria-label="Quantity" defaultValue={String(line.quantity)}
                                            onBlur={(e) => setLine(i, { quantity: parseAmount(e.target.value) || 0 })} />
                                    </td>
                                    <td className="num">
                                        <input className="qty-input wide" inputMode="decimal" aria-label="Unit price" defaultValue={line.unitPrice.toFixed(2)}
                                            onBlur={(e) => setLine(i, { unitPrice: Number(e.target.value.replace(/[$,]/g, "")) || 0 })} />
                                    </td>
                                    <td className="num">{formatMoney(line.quantity * line.unitPrice)}</td>
                                    <td>
                                        <div className="scan-pick">
                                            <select aria-label={"Product for " + s.description}
                                                value={line.skip ? SKIP : line.purchaseUnitId ?? ""}
                                                onChange={(e) => pick(i, e.target.value)}>
                                                <option value="">Pick a product…</option>
                                                <option value={NEW_PRODUCT}>+ Add as a new product</option>
                                                <option value={SKIP}>Skip this line</option>
                                                {vendorOptions.length > 0 && (
                                                    <optgroup label="From this vendor">
                                                        {vendorOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                                    </optgroup>
                                                )}
                                                <optgroup label={vendorOptions.length > 0 ? "Other vendors" : "Products"}>
                                                    {otherOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                                </optgroup>
                                            </select>
                                            {tag && <span className={tag.className} title={tag.title}>{tag.text}</span>}
                                            {line.skip && <span className="muted small">{s.kind === "item" ? "skipped" : s.kind + ", skipped"}</span>}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </section>

            <section className="stat-row">
                <div className="stat">
                    <span className="stat-label">Going on the invoice</span>
                    <span className="stat-value">{formatMoney(entered)}</span>
                    <span className="stat-ratio">{used.length} of {d.lines.length} lines</span>
                </div>
                <div className={"stat" + (off ? " warn" : "")}>
                    <span className="stat-label">Printed {printed.subtotal !== null ? "subtotal" : "total"}</span>
                    <span className="stat-value">{printedTarget !== null ? formatMoney(printedTarget) : "—"}</span>
                    <span className="stat-ratio">{off ? "Lines add up to " + formatMoney(allLines) : printedTarget !== null ? "Lines add up ✓" : ""}</span>
                </div>
            </section>
        </div>
    );
}
