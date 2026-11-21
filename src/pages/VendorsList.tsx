// ===== VendorsList.tsx =====
// Every distributor and supplier, with their rep and when they deliver.

import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { createVendor, unitsFromVendor } from "../data/library";

export default function VendorsList() {
    const db = useDb();
    const navigate = useNavigate();
    const vendors = [...db.vendors].sort((a, b) => a.companyName.localeCompare(b.companyName));

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Vendors</h1>
                    <p className="muted">Distributors and suppliers, their reps, and when they deliver.</p>
                </div>
                <button onClick={() => navigate("/vendors/" + createVendor("New vendor"))}>+ New vendor</button>
            </div>

            {vendors.length === 0 ? (
                <section className="card empty">
                    No vendors yet. Add one, or load sample data from the <Link to="/dashboard">Dashboard</Link>.
                </section>
            ) : (
                <div className="card table-card">
                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Vendor</th>
                                    <th>Rep</th>
                                    <th className="hide-phone">Ordering</th>
                                    <th className="hide-phone">Location</th>
                                    <th className="num">Items</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vendors.map((v) => (
                                    <tr key={v.id} className="clickable" onClick={() => navigate("/vendors/" + v.id)}>
                                        <td>
                                            <Link to={"/vendors/" + v.id} onClick={(e) => e.stopPropagation()}>{v.companyName}</Link>
                                            {v.companyPhone && <div className="muted small">{v.companyPhone}</div>}
                                        </td>
                                        <td>{v.repName || <span className="muted">—</span>}{v.repPhone && <div className="muted small">{v.repPhone}</div>}</td>
                                        <td className="small hide-phone">{v.orderDays || <span className="muted">—</span>}</td>
                                        <td className="small hide-phone">{[v.city, v.state].filter(Boolean).join(", ") || "—"}</td>
                                        <td className="num">{unitsFromVendor(v.id).length}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
