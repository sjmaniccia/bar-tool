// ===== InvoiceDetail.tsx =====
// One invoice, checked line by line against the delivery.
//     Type each line's quantity and price as printed on the paper invoice.
//     A price that differs from what you had is flagged (up in red, down in green).
//     Charges are money that isn't a product: delivery, deposits, a subscription, a credit.
//     Reconciled = checked against what showed up. Approve = record the prices and lock it.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDb } from "../data/storage";
import {
    addInvoiceCharge, addInvoiceLine, approveInvoice, deleteInvoice, invoiceChargesTotal, invoiceProductsTotal,
    invoiceTotal, removeInvoiceCharge, removeInvoiceLine, setInvoiceStatus, updateInvoice, updateInvoiceCharge,
    updateInvoiceLine
} from "../data/purchasing";
import { buyName, isSupply, unitsFromVendor } from "../data/library";
import { formatOf, formatName, productOf } from "../data/costing";
import { currentPrice } from "../data/prices";
import { findById, formatDate, formatMoney, formatPercent } from "../data/utils";
import type { PurchaseUnit } from "../data/types";
import AmountInput from "../components/AmountInput";
import TextInput from "../components/TextInput";
import Status from "../components/Status";
import { costChanges, snapshotCosts, type CostChange } from "../data/alerts";
import { celebrate, toast } from "../feedback";

function itemName(unit: PurchaseUnit): string {
    const format = formatOf(unit);
    return (productOf(unit)?.name ?? "?") + (format ? " " + formatName(format) : "");
}

export default function InvoiceDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { invoiceId } = useParams();
    const invoice = findById(db.invoices, invoiceId ?? null);
    const [adding, setAdding] = useState("");
    // What approving changed (shown once, right after approval)
    const [impact, setImpact] = useState<CostChange[] | null>(null);

    if (invoice === null) {
        return (
            <div className="page">
                <h1>Invoice not found</h1>
                <Link to="/invoices">← Invoices</Link>
            </div>
        );
    }

    const vendor = findById(db.vendors, invoice.vendorId);
    const lines = db.invoiceLines.filter((l) => l.invoiceId === invoice.id);
    const charges = db.invoiceCharges.filter((c) => c.invoiceId === invoice.id);
    const locked = invoice.status === "approved";
    const order = findById(db.orders, invoice.orderId);
    // Lines whose price is different from the current one (these get recorded on approval)
    const changes = lines.filter((l) => Math.abs(l.unitPrice - currentPrice(l.purchaseUnitId)) >= 0.005).length;

    function approve() {
        const message = changes === 0
            ? "Approve this invoice? No prices changed."
            : "Approve this invoice? " + changes + (changes === 1 ? " price" : " prices") + " will be updated, and recipe costs will follow.";
        if (!confirm(message)) return;
        // Take a snapshot of recipe costs, approve, then show what moved
        const before = snapshotCosts();
        const changed = approveInvoice(invoice!.id);
        const impact = costChanges(before);
        setImpact(impact);
        celebrate("small");
        toast("Invoice approved", { sub: changed === 0 ? "No prices changed." : changed + (changed === 1 ? " price" : " prices") + " updated" + (impact.length > 0 ? ", " + impact.length + (impact.length === 1 ? " recipe cost moved" : " recipe costs moved") : "") + "." });
    }

    function remove() {
        if (!confirm("Delete this invoice? Prices already recorded stay.")) return;
        deleteInvoice(invoice!.id);
        navigate("/invoices");
    }

    return (
        <div className="page">
            <Link to="/invoices" className="back">← Invoices</Link>
            <div className="page-header">
                <div>
                    <h1>{vendor?.companyName ?? "Invoice"}{invoice.number && " #" + invoice.number}</h1>
                    <div className="tags">
                        <Status status={invoice.status} />
                        <span className="tag">{formatDate(invoice.invoiceDate)}</span>
                        <span className="tag house">{formatMoney(invoiceTotal(invoice.id))}</span>
                        {order && <Link to={"/orders/" + order.id} className="tag">from order of {formatDate(order.createdAt)}</Link>}
                    </div>
                </div>
                <div className="button-row">
                    {invoice.status === "unreconciled" && <button className="secondary" onClick={() => setInvoiceStatus(invoice.id, "reconciled")}>Mark reconciled</button>}
                    {invoice.status === "reconciled" && <button className="secondary" onClick={() => setInvoiceStatus(invoice.id, "unreconciled")}>Mark unreconciled</button>}
                    {!locked && <button onClick={approve} disabled={lines.length === 0 && charges.length === 0}>Approve</button>}
                    <button className="danger" onClick={remove}>Delete</button>
                </div>
            </div>

            {locked ? (
                <section className="card">
                    <p>Approved. Its prices are now the current prices for these items.</p>
                    {impact !== null && impact.length > 0 && (
                        <>
                            <h3>Recipe costs that moved</h3>
                            <ul className="plain-list">
                                {impact.map((c) => (
                                    <li key={c.recipe.id}>
                                        <Link to={"/recipes/" + c.recipe.id}>{c.recipe.name}</Link>
                                        <span className={c.after > c.before ? "warn" : "good"}>{formatMoney(c.before)} → {formatMoney(c.after)}</span>
                                        {c.ratio !== null && <span className="muted">{formatPercent(c.ratio)} of price</span>}
                                        {c.overTarget && <span className="tag warn-tag">over target</span>}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    {impact !== null && impact.length === 0 && <p className="muted small">No recipe costs changed.</p>}
                </section>
            ) : (
                <section className="card">
                    <div className="form-grid">
                        <label className="form-field"><span>Invoice number</span>
                            <TextInput value={invoice.number} placeholder="From the paper invoice" onSave={(number) => updateInvoice(invoice.id, { number })} /></label>
                        <label className="form-field"><span>Invoice date</span>
                            <TextInput type="date" value={invoice.invoiceDate} required onSave={(invoiceDate) => updateInvoice(invoice.id, { invoiceDate })} /></label>
                        <label className="form-field span-2"><span>Note</span>
                            <TextInput value={invoice.note} placeholder="Shorts, breakage, credits owed…" onSave={(note) => updateInvoice(invoice.id, { note })} /></label>
                    </div>
                </section>
            )}

            <section className="card table-card">
                <h2>Lines</h2>
                {lines.length === 0 ? <p className="card-pad muted">No lines yet.</p> : (
                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr><th>Item</th><th>Qty</th><th>Unit price</th><th className="num">Was</th><th className="num">Total</th>{!locked && <th></th>}</tr>
                            </thead>
                            <tbody>
                                {lines.map((line) => {
                                    const unit = findById(db.purchaseUnits, line.purchaseUnitId);
                                    if (unit === null) return null;
                                    const was = currentPrice(unit.id);
                                    const diff = was > 0 ? (line.unitPrice - was) / was : 0;
                                    const changed = !locked && Math.abs(line.unitPrice - was) >= 0.005;
                                    return (
                                        <tr key={line.id}>
                                            <td>
                                                {itemName(unit)}
                                                {isSupply(productOf(unit)) && <span className="tag supply-tag" title="Counted and ordered, never in recipes or pour cost">supply</span>}
                                                <div className="muted small">{buyName(unit)}</div>
                                            </td>
                                            <td>{locked ? line.quantity : <AmountInput value={line.quantity} className="qty-input" ariaLabel="Quantity"
                                                onSave={(v) => v !== null && updateInvoiceLine(line.id, { quantity: v })} />}</td>
                                            <td>{locked ? formatMoney(line.unitPrice) : <AmountInput value={line.unitPrice} money className="qty-input wide" ariaLabel="Unit price"
                                                onSave={(v) => v !== null && updateInvoiceLine(line.id, { unitPrice: v })} />}</td>
                                            <td className="num">
                                                {was > 0 ? formatMoney(was) : "—"}
                                                {changed && was > 0 && (
                                                    <div className={"small " + (diff > 0 ? "warn" : "good")}>{diff > 0 ? "▲ " : "▼ "}{formatPercent(Math.abs(diff))}</div>
                                                )}
                                            </td>
                                            <td className="num">{formatMoney(line.quantity * line.unitPrice)}</td>
                                            {!locked && <td className="num"><button className="danger icon-button" aria-label="Remove" onClick={() => removeInvoiceLine(line.id)}>✕</button></td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr><td colSpan={4}><strong>Products</strong></td><td className="num"><strong>{formatMoney(invoiceProductsTotal(invoice.id))}</strong></td>{!locked && <td></td>}</tr>
                            </tfoot>
                        </table>
                    </div>
                )}
                {!locked && (
                    <div className="add-line card-pad">
                        <select value={adding} aria-label="Add line" onChange={(e) => setAdding(e.target.value)}>
                            <option value="">Add something {vendor?.companyName} sells…</option>
                            {unitsFromVendor(invoice.vendorId).map((u) => <option key={u.id} value={u.id}>{itemName(u)} · {buyName(u)}</option>)}
                        </select>
                        <button className="secondary" disabled={adding === ""} onClick={() => { addInvoiceLine(invoice.id, adding); setAdding(""); }}>Add</button>
                    </div>
                )}
            </section>

            <section className="card table-card">
                <h2>Charges</h2>
                <p className="card-pad muted small charges-hint">
                    Money that isn't a product: delivery, fuel, deposits, a subscription, a split-case fee.
                    A credit or refund is a negative amount, like -12.00.
                </p>
                {charges.length > 0 && (
                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr><th>What for</th><th className="num">Amount</th>{!locked && <th></th>}</tr>
                            </thead>
                            <tbody>
                                {charges.map((charge) => (
                                    <tr key={charge.id}>
                                        <td>{locked ? charge.description || "Charge" : <TextInput value={charge.description} placeholder="Delivery fee, keg deposit…"
                                            ariaLabel="What the charge is for" onSave={(description) => updateInvoiceCharge(charge.id, { description })} />}</td>
                                        <td className="num">{locked ? formatMoney(charge.amount) : <AmountInput value={charge.amount} money allowNegative className="qty-input wide"
                                            ariaLabel="Charge amount" onSave={(v) => v !== null && updateInvoiceCharge(charge.id, { amount: v })} />}</td>
                                        {!locked && <td className="num"><button className="danger icon-button" aria-label="Remove charge" onClick={() => removeInvoiceCharge(charge.id)}>✕</button></td>}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr><td><strong>Charges</strong></td><td className="num"><strong>{formatMoney(invoiceChargesTotal(invoice.id))}</strong></td>{!locked && <td></td>}</tr>
                            </tfoot>
                        </table>
                    </div>
                )}
                {!locked && (
                    <div className="add-line card-pad">
                        <button className="secondary" onClick={() => addInvoiceCharge(invoice.id)}>+ Add a charge</button>
                    </div>
                )}
            </section>

            <section className="stat-row">
                <div className="stat">
                    <span className="stat-label">Invoice total</span>
                    <span className="stat-value">{formatMoney(invoiceTotal(invoice.id))}</span>
                    <span className="stat-ratio">{formatMoney(invoiceProductsTotal(invoice.id))} products + {formatMoney(invoiceChargesTotal(invoice.id))} charges</span>
                </div>
            </section>
        </div>
    );
}
