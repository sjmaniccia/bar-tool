// ===== ScanInvoice.tsx =====
// Snap the invoice, confirm the basics, check the lines, done.
//
//     1. PHOTOS    take or choose up to 4 photos (one per page)
//     2. READ      the server has Claude read them (10-30 seconds)
//     3. CONFIRM   vendor, invoice number, date and the money totals, against the paper.
//                  Getting the total right first is what lets step 4 catch a misread line.
//     4. ITEMS     each line is a product, a charge, or skipped:
//                      "remembered"  matched the same way last time
//                      "item code"   the vendor's code is on the product
//                      "check"       a guess from the name and size: look at it
//                      "pick one"    pick a product, add it as new, make it a charge, or skip it
//                  plus any charge that isn't a line (a subscription, a fee written in by hand),
//                  and products + charges + tax are checked against the confirmed total
//     5. CREATE    makes a normal draft invoice and opens it. Approving it there records
//                  the prices and shows which recipes changed cost.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { useSession } from "../cloud/session";
import { limitReached, MAX_PAGES, scanInvoice, scanUsage, shrinkPhoto, type ScanUsage } from "../cloud/scan";
import {
    addUnmatchedAsProducts, buildDraft, createInvoiceFromDraft, createProductFromLine, draftTotals, ensureVendor,
    lineAmount, rematch, unitLabel, unmatchedLines, vendorDisplayName,
    type Draft, type DraftLine, type MatchHow
} from "../data/invoiceScan";
import { formatMoney, makeId } from "../data/utils";
import AmountInput from "../components/AmountInput";
import TextInput from "../components/TextInput";
import PhotoPicker from "../components/PhotoPicker";

const NEW_PRODUCT = "__new";
const CHARGE = "__charge";
const SKIP = "__skip";

const HOW_TAG: Record<MatchHow, { text: string; className: string; title: string }> = {
    remembered: { text: "remembered", className: "tag house", title: "Matched the same way on an earlier invoice from this vendor" },
    code: { text: "item code", className: "tag house", title: "The vendor's item code is saved on this product" },
    suggested: { text: "check", className: "tag", title: "A guess from the name and size. Make sure it's right." },
    picked: { text: "matched", className: "tag house", title: "You picked this. Agave will remember it for this vendor." },
    none: { text: "pick one", className: "tag warn-tag", title: "Pick the product, add it as new, make it a charge, or skip the line" }
};

type Step = "photos" | "confirm" | "items";

export default function ScanInvoice() {
    const db = useDb();
    const session = useSession();
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>("photos");
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [draft, setDraft] = useState<Draft | null>(null);
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

    // The photos again, to check the totals against on the confirm screen
    const pageUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
    useEffect(() => () => pageUrls.forEach((url) => URL.revokeObjectURL(url)), [pageUrls]);

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
                setWarnings(reply.warnings);
                setStep("confirm");
            }
        } catch (e) {
            setError("Couldn't read that photo: " + (e instanceof Error ? e.message : String(e)));
        }
        setBusy(false);
    }

    function startOver() {
        setDraft(null);
        setWarnings([]);
        setError("");
        setStep("photos");
    }

    // ===== Step 1: photos =====
    if (step === "photos" || !draft) {
        return (
            <div className="page">
                <div className="page-header">
                    <div>
                        <h1>Scan an invoice</h1>
                        <p className="muted">Take a photo of each page. Flat, in good light, with the whole page in the frame.</p>
                    </div>
                </div>

                <section className="card scan-card">
                    <PhotoPicker files={files} onChange={setFiles} onReject={setError} max={MAX_PAGES} disabled={busy} />
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

    const d = draft;
    const totals = draftTotals(d);

    // ===== Step 2: confirm vendor and totals =====
    if (step === "confirm") {
        const money = (value: number | null, change: (v: number | null) => void, label: string) => (
            <label>
                <span className="small muted">{label}</span>
                <AmountInput value={value} money allowBlank allowNegative placeholder="—" ariaLabel={label} onSave={change} />
            </label>
        );
        return (
            <div className="page">
                <div className="page-header">
                    <div>
                        <h1>Confirm the invoice</h1>
                        <p className="muted">Check these against the paper first. The total is what every line gets checked against next.</p>
                    </div>
                    <div className="button-row">
                        <button className="secondary" onClick={startOver}>Start over</button>
                        <button onClick={() => setStep("items")}>Next: the items →</button>
                    </div>
                </div>

                <div className="scan-confirm">
                    <section className="card scan-confirm-fields">
                        <label className="scan-wide">
                            <span className="small muted">Vendor</span>
                            <select value={d.vendorId ?? ""} onChange={(e) => setDraft(rematch(d, e.target.value || null))}>
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
                        {money(d.subtotal, (subtotal) => setDraft({ ...d, subtotal }), "Subtotal")}
                        {money(d.tax, (tax) => setDraft({ ...d, tax }), "Tax")}
                        <label className="scan-wide scan-total">
                            <span className="small muted">Invoice total (what you owe)</span>
                            <AmountInput value={d.total} money allowBlank allowNegative placeholder="Type the total" ariaLabel="Invoice total"
                                onSave={(total) => setDraft({ ...d, total })} />
                        </label>
                        <p className="scan-wide muted small">
                            Claude found {d.lines.length} {d.lines.length === 1 ? "line" : "lines"}.
                            {d.total === null && " Type the total from the invoice so Agave can check the lines add up."}
                        </p>
                        {warnings.length > 0 && (
                            <ul className="scan-wide scan-warnings warn small">
                                {warnings.map((w) => <li key={w}>{w}</li>)}
                            </ul>
                        )}
                    </section>
                    <div className="scan-confirm-pages">
                        {pageUrls.map((url, i) => (
                            <a key={url} href={url} target="_blank" rel="noreferrer" title="Open full size">
                                <img src={url} alt={"Page " + (i + 1)} />
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ===== Step 3: items and charges =====
    const vendorUnits = db.purchaseUnits.filter((u) => u.vendorId === d.vendorId);
    const otherUnits = db.purchaseUnits.filter((u) => u.vendorId !== d.vendorId);
    const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
    const vendorOptions = vendorUnits.map((u) => ({ id: u.id, label: unitLabel(u) })).sort(byLabel);
    const otherOptions = otherUnits.map((u) => ({ id: u.id, label: unitLabel(u) })).sort(byLabel);
    const unmatched = unmatchedLines(d);

    function setLine(index: number, change: Partial<DraftLine>) {
        setDraft({ ...d, lines: d.lines.map((l, i) => (i === index ? { ...l, ...change } : l)) });
    }

    function pick(index: number, value: string) {
        if (value === SKIP) return setLine(index, { use: "skip", purchaseUnitId: null, how: "picked" });
        if (value === CHARGE) return setLine(index, { use: "charge", purchaseUnitId: null, how: "picked" });
        if (value === NEW_PRODUCT) {
            // A new product needs a vendor to buy it from: add the vendor now if it's new
            const vendorId = ensureVendor(d);
            const unitId = createProductFromLine({ ...d.lines[index].scanned, unitPrice: d.lines[index].unitPrice }, vendorId);
            setDraft({
                ...d, vendorId,
                lines: d.lines.map((l, i) => (i === index ? { ...l, use: "product", purchaseUnitId: unitId, how: "picked" } : l))
            });
            if (!unitId) setError("Couldn't add that product. Add it on the Products page, then pick it here.");
            return;
        }
        setLine(index, { use: "product", purchaseUnitId: value || null, how: value ? "picked" : "none" });
    }

    function addAll() {
        const { draft: next, added } = addUnmatchedAsProducts(d);
        setDraft(next);
        if (added < unmatched.length) setError("Some lines couldn't be added. Pick a product for them, or skip them.");
    }

    function setExtra(id: string, change: { description?: string; amount?: number }) {
        setDraft({ ...d, extraCharges: d.extraCharges.map((c) => (c.id === id ? { ...c, ...change } : c)) });
    }

    function create() {
        const problems: string[] = [];
        if (unmatched.length > 0) problems.push(unmatched.length + (unmatched.length === 1 ? " line has" : " lines have") + " no product and won't be entered.");
        if (totals.off !== null && Math.abs(totals.off) > 0.05) problems.push("It's " + formatMoney(Math.abs(totals.off)) + (totals.off > 0 ? " over" : " under") + " the invoice total.");
        if (problems.length > 0 && !confirm(problems.join(" ") + " Create the invoice anyway?")) return;
        navigate("/invoices/" + createInvoiceFromDraft(d));
    }

    const selectValue = (line: DraftLine) => (line.use === "skip" ? SKIP : line.use === "charge" ? CHARGE : line.purchaseUnitId ?? "");
    const balanced = totals.off !== null && Math.abs(totals.off) <= 0.05;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Check the items</h1>
                    <p className="muted">
                        {d.vendorId ? db.vendors.find((v) => v.id === d.vendorId)?.companyName : vendorDisplayName(d.vendorName)}
                        {d.number && " · #" + d.number}
                        {d.total !== null && " · " + formatMoney(d.total)}
                        {" · "}<button className="link-button" onClick={() => setStep("confirm")}>Change</button>
                    </p>
                </div>
                <div className="button-row">
                    <button className="secondary" onClick={startOver}>Start over</button>
                    <button onClick={create} disabled={totals.entered === 0 && d.extraCharges.length === 0}>Create invoice</button>
                </div>
            </div>

            {error && <p className="error" role="alert">{error}</p>}

            {unmatched.length > 0 && (
                <section className="card scan-fill">
                    <div>
                        <strong>{unmatched.length} {unmatched.length === 1 ? "item isn't" : "items aren't"} in Agave yet.</strong>
                        <span className="muted small">
                            {" "}Add {unmatched.length === 1 ? "it" : "them"} as new products: name, bottle size, case size and this price
                            {d.vendorId ? "" : ", plus " + vendorDisplayName(d.vendorName) + " as a vendor"}.
                            If one is really a fee or a service, make it a charge instead.
                        </span>
                    </div>
                    <button onClick={addAll}>+ Add {unmatched.length} as new products</button>
                </section>
            )}

            <section className="card table-card">
                <table className="table scan-table">
                    <thead>
                        <tr><th>On the invoice</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th><th>Goes on as</th></tr>
                    </thead>
                    <tbody>
                        {d.lines.map((line, i) => {
                            const s = line.scanned;
                            const tag = line.use === "product" ? HOW_TAG[line.purchaseUnitId ? line.how : "none"] : null;
                            return (
                                <tr key={i} className={line.use === "skip" ? "scan-skipped" : ""}>
                                    <td>
                                        <div>{s.description}</div>
                                        <div className="muted small">
                                            {[
                                                s.sku && "#" + s.sku, s.packSize, s.unit,
                                                s.bottles && "split case: " + s.bottles + (s.bottles === 1 ? " bottle" : " bottles"),
                                                s.kind !== "item" && s.kind,
                                                s.quantity === 0 && !s.lineTotal && "not shipped"
                                            ].filter(Boolean).join(" · ")}
                                        </div>
                                        {s.warning && <div className="warn small">{s.warning}</div>}
                                    </td>
                                    <td className="num">
                                        <AmountInput value={line.quantity} allowNegative className="qty-input" ariaLabel="Quantity"
                                            onSave={(v) => v !== null && setLine(i, { quantity: v })} />
                                    </td>
                                    <td className="num">
                                        <AmountInput value={line.unitPrice} money className="qty-input wide" ariaLabel="Unit price"
                                            onSave={(v) => v !== null && setLine(i, { unitPrice: v })} />
                                    </td>
                                    <td className="num">{formatMoney(lineAmount(line))}</td>
                                    <td>
                                        <div className="scan-pick">
                                            <select aria-label={"What " + s.description + " is"} value={selectValue(line)} onChange={(e) => pick(i, e.target.value)}>
                                                <option value="">Pick a product…</option>
                                                <option value={NEW_PRODUCT}>+ Add as a new product</option>
                                                <option value={CHARGE}>A charge (not a product)</option>
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
                                            {line.use === "charge" && <span className="tag house" title="Goes on the invoice as money, not as a product">{line.how === "remembered" ? "charge, remembered" : "charge"}</span>}
                                            {line.use === "skip" && <span className="muted small">skipped</span>}
                                            {line.use !== "skip" && line.quantity === 0 && line.unitPrice > 0 && <span className="tag warn-tag">qty is 0</span>}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </section>

            <section className="card table-card">
                <h2>Other charges</h2>
                <p className="card-pad muted small charges-hint">
                    Anything on the invoice that isn't a line above: a subscription, a fee written in by hand, a credit (type it negative, like -12.00).
                </p>
                {d.extraCharges.length > 0 && (
                    <table className="table">
                        <tbody>
                            {d.extraCharges.map((c) => (
                                <tr key={c.id}>
                                    <td><TextInput value={c.description} placeholder="What it's for" ariaLabel="What the charge is for"
                                        onSave={(description) => setExtra(c.id, { description })} /></td>
                                    <td className="num"><AmountInput value={c.amount} money allowNegative className="qty-input wide" ariaLabel="Charge amount"
                                        onSave={(v) => v !== null && setExtra(c.id, { amount: v })} /></td>
                                    <td className="num"><button className="danger icon-button" aria-label="Remove charge"
                                        onClick={() => setDraft({ ...d, extraCharges: d.extraCharges.filter((x) => x.id !== c.id) })}>✕</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div className="add-line card-pad">
                    <button className="secondary" onClick={() => setDraft({ ...d, extraCharges: [...d.extraCharges, { id: makeId(), description: "", amount: 0 }] })}>
                        + Add a charge
                    </button>
                </div>
            </section>

            <section className="stat-row">
                <div className="stat">
                    <span className="stat-label">Going on the invoice</span>
                    <span className="stat-value">{formatMoney(totals.entered)}</span>
                    <span className="stat-ratio">
                        {formatMoney(totals.products)} products + {formatMoney(totals.charges)} charges{totals.tax ? " + " + formatMoney(totals.tax) + " tax" : ""}
                    </span>
                </div>
                <div className={"stat" + (totals.off !== null && !balanced ? " warn" : "")}>
                    <span className="stat-label">Invoice total</span>
                    <span className="stat-value">{totals.target !== null ? formatMoney(totals.target) : "—"}</span>
                    <span className="stat-ratio">
                        {totals.off === null ? "No total to check against" : balanced ? "Matches ✓" : "Off by " + formatMoney(Math.abs(totals.off)) + (totals.off > 0 ? " (over)" : " (under)")}
                    </span>
                </div>
            </section>
        </div>
    );
}
