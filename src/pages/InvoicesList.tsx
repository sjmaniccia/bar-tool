// ===== InvoicesList.tsx =====
// Invoices from vendors. Approving one records its prices, so recipe costs follow real invoices.

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { createInvoice, invoiceTotal } from "../data/purchasing";
import { findById, formatDate, formatMoney } from "../data/utils";
import Status from "../components/Status";

export default function InvoicesList() {
    const db = useDb();
    const navigate = useNavigate();
    const [vendorId, setVendorId] = useState("");
    const invoices = [...db.invoices].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
    const waiting = invoices.filter((i) => i.status !== "approved");

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Invoices</h1>
                    <p className="muted">Check deliveries against the invoice, then approve to update your prices.</p>
                </div>
                <div className="add-line">
                    <Link className="button" to="/invoices/scan">📷 Scan invoice</Link>
                    <select value={vendorId} aria-label="Vendor for new invoice" onChange={(e) => setVendorId(e.target.value)}>
                        <option value="">Choose a vendor…</option>
                        {db.vendors.map((v) => <option key={v.id} value={v.id}>{v.companyName}</option>)}
                    </select>
                    <button className="secondary" disabled={vendorId === ""} onClick={() => navigate("/invoices/" + createInvoice(vendorId))}>+ Type one in</button>
                </div>
            </div>

            <div className="stat-row">
                <div className="stat">
                    <span className="stat-label">Waiting for approval</span>
                    <span className="stat-value">{waiting.length}</span>
                    <span className="stat-ratio">{formatMoney(waiting.reduce((sum, i) => sum + invoiceTotal(i.id), 0))}</span>
                </div>
                <div className="stat">
                    <span className="stat-label">Approved</span>
                    <span className="stat-value">{invoices.length - waiting.length}</span>
                </div>
            </div>

            <section className="card table-card">
                {invoices.length === 0 ? (
                    <p className="card-pad muted">No invoices yet. Receive an <Link to="/orders">order</Link>, or start one here.</p>
                ) : (
                    <table className="table">
                        <thead><tr><th>Vendor</th><th>Invoice #</th><th>Date</th><th>Status</th><th className="num">Total</th></tr></thead>
                        <tbody>
                            {invoices.map((invoice) => (
                                <tr key={invoice.id} className="clickable" onClick={() => navigate("/invoices/" + invoice.id)}>
                                    <td><Link to={"/invoices/" + invoice.id} onClick={(e) => e.stopPropagation()}>{findById(db.vendors, invoice.vendorId)?.companyName ?? "?"}</Link></td>
                                    <td>{invoice.number || <span className="muted">—</span>}</td>
                                    <td>{formatDate(invoice.invoiceDate)}</td>
                                    <td><Status status={invoice.status} /></td>
                                    <td className="num">{formatMoney(invoiceTotal(invoice.id))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}
