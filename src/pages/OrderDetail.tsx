// ===== OrderDetail.tsx =====
// One order to one vendor.
//     draft     add lines, change quantities
//     sent      email or text it to the rep (the order text is written for you)
//     received  starts an invoice with the same lines, to check against the delivery

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDb } from "../data/storage";
import { deleteOrder, orderTotal, receiveOrder, setOrderQuantity, setOrderStatus, updateOrder } from "../data/purchasing";
import { buyName, unitsFromVendor } from "../data/library";
import { formatOf, formatName, productOf } from "../data/costing";
import { currentPrice } from "../data/prices";
import { findById, formatDate, formatMoney } from "../data/utils";
import type { PurchaseUnit } from "../data/types";
import AmountInput from "../components/AmountInput";
import TextInput from "../components/TextInput";
import Status from "../components/Status";
import { toast } from "../feedback";

// "Island White Rum 1000 ml bottle"
function itemName(unit: PurchaseUnit): string {
    const format = formatOf(unit);
    return (productOf(unit)?.name ?? "?") + (format ? " " + formatName(format) : "");
}

export default function OrderDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { orderId } = useParams();
    const order = findById(db.orders, orderId ?? null);
    const [adding, setAdding] = useState("");

    if (order === null) {
        return (
            <div className="page">
                <h1>Order not found</h1>
                <Link to="/orders">← Orders</Link>
            </div>
        );
    }

    const vendor = findById(db.vendors, order.vendorId);
    const lines = db.orderLines.filter((l) => l.orderId === order.id);
    const draft = order.status === "draft";
    const onOrder = new Set(lines.map((l) => l.purchaseUnitId));
    const canAdd = unitsFromVendor(order.vendorId).filter((u) => !onOrder.has(u.id));
    const invoices = db.invoices.filter((i) => i.orderId === order.id);

    // The order written out for the rep
    const text = [
        "Order for " + (vendor?.companyName ?? "") + " (" + formatDate(order.createdAt) + "):",
        ...lines.map((l) => {
            const unit = findById(db.purchaseUnits, l.purchaseUnitId);
            return unit ? "- " + l.quantity + " × " + buyName(unit) + " " + itemName(unit) + (unit.sku ? " (SKU " + unit.sku + ")" : "") : "";
        }),
        order.note ? "\nNote: " + order.note : "",
        "\nThank you!"
    ].join("\n");

    function add() {
        if (adding === "") return;
        setOrderQuantity(order!.id, adding, 1);
        setAdding("");
    }

    function receive() {
        const invoiceId = receiveOrder(order!.id);
        if (invoiceId) navigate("/invoices/" + invoiceId);
    }

    function remove() {
        if (!confirm("Delete this order?")) return;
        deleteOrder(order!.id);
        navigate("/orders");
    }

    return (
        <div className="page">
            <Link to="/orders" className="back">← Orders</Link>
            <div className="page-header">
                <div>
                    <h1>{vendor?.companyName ?? "Order"}</h1>
                    <div className="tags">
                        <Status status={order.status} />
                        <span className="tag">{formatDate(order.createdAt)}</span>
                        <span className="tag house">{formatMoney(orderTotal(order.id))}</span>
                    </div>
                </div>
                <div className="button-row">
                    {draft && <button onClick={() => { setOrderStatus(order.id, "sent"); toast("Order marked sent", { sound: "whoosh", action: { label: "Undo", run: () => setOrderStatus(order.id, "draft") } }); }} disabled={lines.length === 0}>Mark sent</button>}
                    {order.status === "sent" && <button onClick={receive}>Receive delivery</button>}
                    {order.status === "sent" && <button className="secondary" onClick={() => setOrderStatus(order.id, "draft")}>Back to draft</button>}
                    <button className="danger" onClick={remove}>Delete</button>
                </div>
            </div>

            {invoices.length > 0 && (
                <section className="card">
                    Received. Invoice: {invoices.map((i) => <Link key={i.id} to={"/invoices/" + i.id}>{i.number ? "#" + i.number : formatDate(i.invoiceDate)}</Link>)}
                </section>
            )}

            <section className="card table-card">
                <h2>Items</h2>
                {lines.length === 0 ? <p className="card-pad muted">Nothing on this order yet.</p> : (
                    <div className="table-scroll">
                        <table className="table">
                            <thead><tr><th>Item</th><th>Buy as</th><th>Qty</th><th className="num">Price</th><th className="num">Total</th>{draft && <th></th>}</tr></thead>
                            <tbody>
                                {lines.map((line) => {
                                    const unit = findById(db.purchaseUnits, line.purchaseUnitId);
                                    if (unit === null) return null;
                                    const price = currentPrice(unit.id);
                                    return (
                                        <tr key={line.id}>
                                            <td>{itemName(unit)}{unit.sku && <div className="muted small">SKU {unit.sku}</div>}</td>
                                            <td>{buyName(unit)}</td>
                                            <td>{draft
                                                ? <AmountInput value={line.quantity} className="qty-input" ariaLabel="Quantity"
                                                    onSave={(v) => setOrderQuantity(order.id, unit.id, v ?? 0)} />
                                                : line.quantity}</td>
                                            <td className="num">{price > 0 ? formatMoney(price) : "—"}</td>
                                            <td className="num">{formatMoney(price * line.quantity)}</td>
                                            {draft && <td className="num"><button className="danger icon-button" aria-label="Remove"
                                                onClick={() => setOrderQuantity(order.id, unit.id, 0)}>✕</button></td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {draft && (
                    <div className="add-line card-pad">
                        <select value={adding} aria-label="Add item" onChange={(e) => setAdding(e.target.value)}>
                            <option value="">Add something {vendor?.companyName} sells…</option>
                            {canAdd.map((u) => <option key={u.id} value={u.id}>{itemName(u)} · {buyName(u)}</option>)}
                        </select>
                        <button className="secondary" onClick={add} disabled={adding === ""}>Add</button>
                    </div>
                )}
            </section>

            <div className="card-grid">
                <section className="card">
                    <h2>Note</h2>
                    <TextInput multiline value={order.note} placeholder="Delivery instructions, substitutions…" onSave={(note) => updateOrder(order.id, { note })} />
                </section>
                <section className="card">
                    <h2>Send to the rep</h2>
                    <pre className="order-text">{text}</pre>
                    <div className="button-row">
                        <button className="secondary" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
                        {vendor?.repEmail && <a className="button secondary-link" href={"mailto:" + vendor.repEmail + "?subject=" + encodeURIComponent("Order") + "&body=" + encodeURIComponent(text)}>Email {vendor.repName || "rep"}</a>}
                        {vendor?.repPhone && <a className="button secondary-link" href={"sms:" + vendor.repPhone + "?&body=" + encodeURIComponent(text)}>Text {vendor.repName || "rep"}</a>}
                    </div>
                </section>
            </div>
        </div>
    );
}
