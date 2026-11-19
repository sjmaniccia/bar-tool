// ===== OrdersList.tsx =====
// Orders to vendors, plus what's below par right now.
//     "Create suggested orders" makes one draft per vendor from the latest finished count.

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { createOrder, createSuggestedOrders, orderTotal, suggestions } from "../data/purchasing";
import { latestClosedCount, unitWord } from "../data/inventory";
import { buyName } from "../data/library";
import { formatOf, productOf } from "../data/costing";
import { findById, formatAmount, formatDate, formatMoney } from "../data/utils";
import Status from "../components/Status";

export default function OrdersList() {
    const db = useDb();
    const navigate = useNavigate();
    const [vendorId, setVendorId] = useState("");
    const orders = [...db.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const suggested = suggestions();
    const latest = latestClosedCount();

    function newOrder() {
        if (vendorId === "") return;
        navigate("/orders/" + createOrder(vendorId));
    }

    function createSuggested() {
        const made = createSuggestedOrders();
        alert(made === 1 ? "1 draft order made." : made + " draft orders made.");
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Orders</h1>
                    <p className="muted">Build orders from your pars, send them, then receive them into an invoice.</p>
                </div>
                <div className="add-line">
                    <select value={vendorId} aria-label="Vendor for new order" onChange={(e) => setVendorId(e.target.value)}>
                        <option value="">Choose a vendor…</option>
                        {db.vendors.map((v) => <option key={v.id} value={v.id}>{v.companyName}</option>)}
                    </select>
                    <button onClick={newOrder} disabled={vendorId === ""}>+ New order</button>
                </div>
            </div>

            <section className="card">
                <div className="card-header">
                    <h2>Below par</h2>
                    {suggested.size > 0 && <button onClick={createSuggested}>Create suggested orders</button>}
                </div>
                {latest === null ? (
                    <p className="muted">Finish a <Link to="/counts">stock count</Link> and set pars on your products to get suggestions.</p>
                ) : suggested.size === 0 ? (
                    <p className="muted">Everything is at or above par as of the {formatDate(latest.countedAt)} count.</p>
                ) : (
                    <>
                        <p className="muted small">From the {formatDate(latest.countedAt)} count. Quantities round up to whole purchase units.</p>
                        <div className="card-grid">
                            {[...suggested].map(([vId, list]) => (
                                <div key={vId} className="sub-card">
                                    <h3>{findById(db.vendors, vId)?.companyName ?? "?"}</h3>
                                    <ul className="plain-list">
                                        {list.map((s) => {
                                            const format = formatOf(s.unit);
                                            return (
                                                <li key={s.unit.id}>
                                                    <strong>{s.quantity} × {buyName(s.unit)}</strong> {productOf(s.unit)?.name}
                                                    <div className="muted small">
                                                        have {formatAmount(s.onHand)}{s.incoming > 0 && ", " + formatAmount(s.incoming) + " coming"}, par {formatAmount(s.par)} {format ? unitWord(format) + "s" : ""}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </section>

            <section className="card table-card">
                <h2>All orders</h2>
                {orders.length === 0 ? <p className="card-pad muted">No orders yet.</p> : (
                    <table className="table">
                        <thead><tr><th>Vendor</th><th>Date</th><th>Status</th><th className="num">Lines</th><th className="num">Total</th></tr></thead>
                        <tbody>
                            {orders.map((order) => (
                                <tr key={order.id} className="clickable" onClick={() => navigate("/orders/" + order.id)}>
                                    <td><Link to={"/orders/" + order.id} onClick={(e) => e.stopPropagation()}>{findById(db.vendors, order.vendorId)?.companyName ?? "?"}</Link></td>
                                    <td>{formatDate(order.createdAt)}</td>
                                    <td><Status status={order.status} /></td>
                                    <td className="num">{db.orderLines.filter((l) => l.orderId === order.id).length}</td>
                                    <td className="num">{formatMoney(orderTotal(order.id))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}
