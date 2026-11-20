// ===== Dashboard.tsx =====
// The home page: what needs attention today, the big numbers, and getting started.
//     Needs attention   items below par, invoices waiting, counts left open, recipes missing prices

import { Link } from "react-router";
import { useDb, replaceAll } from "../data/storage";
import { sampleData } from "../data/sampleData";
import { countTotals, latestClosedCount } from "../data/inventory";
import { invoiceTotal, suggestions } from "../data/purchasing";
import { missingPrices } from "../data/costing";
import { findById, formatAmount, plural, formatDate, formatMoney, formatPercent } from "../data/utils";
import { latestShortages, recipesOverTarget } from "../data/alerts";
import { formatLabel, unitWord } from "../data/inventory";

export default function Dashboard() {
    const db = useDb();   // redraws whenever data changes

    const latest = latestClosedCount();
    const belowPar = [...suggestions().values()].reduce((sum, list) => sum + list.length, 0);
    const waitingInvoices = db.invoices.filter((i) => i.status !== "approved");
    const openCounts = db.stockCounts.filter((c) => c.status === "open");
    const draftOrders = db.orders.filter((o) => o.status === "draft");
    const overTarget = recipesOverTarget();
    const shortages = latestShortages();
    const missing = db.recipes.filter((r) => {
        try {
            return missingPrices(r.id).length > 0;
        } catch {
            return false;
        }
    });

    // Only the things that actually need doing show up
    const todo = [
        belowPar > 0 && { to: "/orders", text: belowPar + (belowPar === 1 ? " item is" : " items are") + " below par", action: "Order" },
        draftOrders.length > 0 && { to: "/orders", text: draftOrders.length + " draft " + (draftOrders.length === 1 ? "order" : "orders") + " not sent", action: "Review" },
        waitingInvoices.length > 0 && {
            to: "/invoices",
            text: waitingInvoices.length + (waitingInvoices.length === 1 ? " invoice" : " invoices") + " waiting for approval ("
                + formatMoney(waitingInvoices.reduce((s, i) => s + invoiceTotal(i.id), 0)) + ")",
            action: "Approve"
        },
        openCounts.length > 0 && { to: "/counts/" + openCounts[0].id, text: openCounts.length + (openCounts.length === 1 ? " count is" : " counts are") + " still open", action: "Finish" },
        missing.length > 0 && { to: "/recipes", text: missing.length + (missing.length === 1 ? " recipe is" : " recipes are") + " missing prices", action: "Fix" },
        overTarget.length > 0 && {
            to: "/recipes/" + overTarget[0].id,
            text: (overTarget.length === 1 ? overTarget[0].name + " is" : overTarget.length + " recipes are") + " over target cost",
            action: "Review"
        },
        shortages.unmatched > 0 && {
            to: "/sales",
            text: shortages.unmatched + (shortages.unmatched === 1 ? " item" : " items") + " from your POS " + (shortages.unmatched === 1 ? "isn't" : "aren't") + " matched to a recipe yet",
            action: "Match"
        },
        ...shortages.products.slice(0, 3).map((s) => {
            const format = findById(db.formats, s.formatId);
            const missing = Math.round(s.missing * 10) / 10;
            return {
                to: "/reports",
                text: (format ? formatLabel(format) : "A product") + ": " + (format ? plural(missing, unitWord(format)) : formatAmount(missing) + " units")
                    + " short (" + formatMoney(s.dollars) + ", " + formatPercent(s.share) + ")",
                action: "Investigate"
            };
        })
    ].filter((t) => t !== false);

    const stats = [
        { label: "Inventory value", value: latest ? formatMoney(countTotals(latest.id).value) : "—", note: latest ? "counted " + formatDate(latest.countedAt) : "no finished count yet", to: "/counts" },
        { label: "Recipes", value: String(db.recipes.length), note: db.menus.length + (db.menus.length === 1 ? " menu" : " menus"), to: "/recipes" },
        { label: "Products", value: String(db.products.length), note: db.ingredients.length + " ingredients", to: "/products" },
        { label: "Vendors", value: String(db.vendors.length), note: db.orders.length + " orders", to: "/vendors" }
    ];

    // Replace everything with the sample bar
    //     IF there's already data, ask first
    function loadSample() {
        const hasData = db.recipes.length + db.products.length > 0;
        if (hasData && !confirm("This replaces all your current data with sample data. Continue?")) {
            return;
        }
        replaceAll(sampleData());
    }

    return (
        <div className="page">
            <div className="page-header">
                <h1>Dashboard</h1>
            </div>

            <div className="stat-grid">
                {stats.map((s) => (
                    <Link key={s.label} to={s.to} className="card stat-card">
                        <span className="stat-label">{s.label}</span>
                        <span className="stat-number">{s.value}</span>
                        <span className="muted small">{s.note}</span>
                    </Link>
                ))}
            </div>

            {todo.length > 0 && (
                <section className="card">
                    <h2>Needs attention</h2>
                    <ul className="todo">
                        {todo.map((t) => (
                            <li key={t.text}>
                                <span>{t.text}</span>
                                <Link to={t.to} className="button secondary-link">{t.action}</Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="card">
                <h2>Getting started</h2>
                <ol className="steps">
                    <li>Add your <Link to="/vendors">vendors</Link> and <Link to="/products">products</Link>, with what you pay.</li>
                    <li>Write <Link to="/recipes">recipes</Link>. Ingredients can be added before any products exist.</li>
                    <li>Pick house choices and compare sources on <Link to="/ingredients">Ingredients</Link>.</li>
                    <li>Set pars on products, then do a <Link to="/counts">stock count</Link> to get order suggestions.</li>
                    <li>Approve <Link to="/invoices">invoices</Link> as deliveries arrive, and your costs stay current.</li>
                </ol>
                <button className="secondary" onClick={loadSample}>Load sample data</button>
            </section>
        </div>
    );
}
