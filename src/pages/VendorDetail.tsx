// ===== VendorDetail.tsx =====
// One vendor: company info, the rep, ordering notes, what they sell, and their orders and invoices.
// State is stored separately because alcohol laws differ by state (TN, GA, AL are all close to Chattanooga).

import { Link, useNavigate, useParams } from "react-router";
import { useDb } from "../data/storage";
import { buyName, deleteVendor, unitsFromVendor, updateVendor } from "../data/library";
import { formatOf, formatName, productOf } from "../data/costing";
import { currentPrice } from "../data/prices";
import { createOrder, invoiceTotal, orderTotal } from "../data/purchasing";
import { findById, formatDate, formatMoney } from "../data/utils";
import type { Vendor } from "../data/types";
import TextInput from "../components/TextInput";
import Status from "../components/Status";

const STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
    "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
    "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

export default function VendorDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { vendorId } = useParams();
    const vendor = findById(db.vendors, vendorId ?? null);

    if (vendor === null) {
        return (
            <div className="page">
                <h1>Vendor not found</h1>
                <Link to="/vendors">← Vendors</Link>
            </div>
        );
    }

    const update = (changes: Partial<Vendor>) => updateVendor(vendor.id, changes);
    const units = unitsFromVendor(vendor.id);
    const orders = db.orders.filter((o) => o.vendorId === vendor.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const invoices = db.invoices.filter((i) => i.vendorId === vendor.id).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

    function remove() {
        if (!confirm("Delete " + vendor!.companyName + "? Their products stay, with no vendor.")) return;
        if (deleteVendor(vendor!.id)) navigate("/vendors");
        else alert(vendor!.companyName + " has orders or invoices, so they're kept for your records.");
    }

    return (
        <div className="page">
            <Link to="/vendors" className="back">← Vendors</Link>
            <div className="page-header">
                <div>
                    <h1>{vendor.companyName}</h1>
                    <div className="tags">
                        {vendor.state && <span className="tag">{vendor.state}</span>}
                        <span className="tag">{units.length} items</span>
                    </div>
                </div>
                <div className="button-row">
                    <button onClick={() => navigate("/orders/" + createOrder(vendor.id))}>+ New order</button>
                    <button className="danger" onClick={remove}>Delete</button>
                </div>
            </div>

            <div className="card-grid">
                <section className="card">
                    <h2>Company</h2>
                    <div className="form-grid">
                        <label className="form-field span-2"><span>Name</span>
                            <TextInput value={vendor.companyName} required onSave={(companyName) => update({ companyName })} /></label>
                        <label className="form-field span-2"><span>Phone</span>
                            <TextInput type="tel" value={vendor.companyPhone} onSave={(companyPhone) => update({ companyPhone })} /></label>
                        <label className="form-field span-2"><span>Street</span>
                            <TextInput value={vendor.street} onSave={(street) => update({ street })} /></label>
                        <label className="form-field"><span>City</span>
                            <TextInput value={vendor.city} onSave={(city) => update({ city })} /></label>
                        <label className="form-field"><span>State</span>
                            <select value={vendor.state} onChange={(e) => update({ state: e.target.value })}>
                                <option value="">—</option>
                                {STATES.map((s) => <option key={s}>{s}</option>)}
                            </select></label>
                        <label className="form-field"><span>ZIP</span>
                            <TextInput value={vendor.zip} onSave={(zip) => update({ zip })} /></label>
                    </div>
                </section>

                <section className="card">
                    <h2>Sales rep</h2>
                    <div className="form-grid">
                        <label className="form-field span-2"><span>Name</span>
                            <TextInput value={vendor.repName} onSave={(repName) => update({ repName })} /></label>
                        <label className="form-field span-2"><span>Phone</span>
                            <TextInput type="tel" value={vendor.repPhone} onSave={(repPhone) => update({ repPhone })} /></label>
                        <label className="form-field span-2"><span>Email</span>
                            <TextInput type="email" value={vendor.repEmail} onSave={(repEmail) => update({ repEmail })} /></label>
                    </div>
                    {(vendor.repPhone || vendor.repEmail) && (
                        <div className="button-row">
                            {vendor.repPhone && <a className="button secondary-link" href={"tel:" + vendor.repPhone}>Call</a>}
                            {vendor.repPhone && <a className="button secondary-link" href={"sms:" + vendor.repPhone}>Text</a>}
                            {vendor.repEmail && <a className="button secondary-link" href={"mailto:" + vendor.repEmail}>Email</a>}
                        </div>
                    )}
                </section>

                <section className="card">
                    <h2>Ordering</h2>
                    <label className="form-field"><span>Order and delivery days</span>
                        <TextInput value={vendor.orderDays} placeholder="Order by Mon, delivers Wed" onSave={(orderDays) => update({ orderDays })} /></label>
                    <label className="form-field"><span>Notes</span>
                        <TextInput multiline value={vendor.notes} placeholder="Minimums, discounts, account number…" onSave={(notes) => update({ notes })} /></label>
                </section>
            </div>

            <section className="card table-card">
                <h2>What they sell</h2>
                {units.length === 0 ? (
                    <p className="card-pad muted">Nothing yet. On a product's page, set a way to buy it to come from {vendor.companyName}.</p>
                ) : (
                    <div className="table-scroll">
                        <table className="table">
                            <thead><tr><th>Product</th><th>Format</th><th>Buy as</th><th>SKU</th><th className="num">Price</th></tr></thead>
                            <tbody>
                                {units.map((unit) => {
                                    const product = productOf(unit);
                                    const format = formatOf(unit);
                                    const price = currentPrice(unit.id);
                                    return (
                                        <tr key={unit.id}>
                                            <td>{product ? <Link to={"/products/" + product.id}>{product.name}</Link> : "?"}</td>
                                            <td>{format ? formatName(format) : "?"}</td>
                                            <td>{buyName(unit)}</td>
                                            <td className="muted">{unit.sku || "—"}</td>
                                            <td className="num">{price > 0 ? formatMoney(price) : "—"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <div className="card-grid">
                <section className="card">
                    <h2>Orders</h2>
                    {orders.length === 0 ? <p className="muted">No orders yet.</p> : (
                        <ul className="plain-list">
                            {orders.map((o) => (
                                <li key={o.id}>
                                    <Link to={"/orders/" + o.id}>{formatDate(o.createdAt)}</Link> <Status status={o.status} />
                                    <span className="muted"> {formatMoney(orderTotal(o.id))}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
                <section className="card">
                    <h2>Invoices</h2>
                    {invoices.length === 0 ? <p className="muted">No invoices yet.</p> : (
                        <ul className="plain-list">
                            {invoices.map((i) => (
                                <li key={i.id}>
                                    <Link to={"/invoices/" + i.id}>{i.number ? "#" + i.number : formatDate(i.invoiceDate)}</Link> <Status status={i.status} />
                                    <span className="muted"> {formatMoney(invoiceTotal(i.id))}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
}
