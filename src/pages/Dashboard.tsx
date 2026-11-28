// ===== Dashboard.tsx =====
// Numbers: the four that matter (pour cost, missing, sales, on the shelf), then what needs doing.
//     Needs attention   items below par, invoices waiting, counts left open, recipes missing prices

import { Link } from "react-router";
import { useDb, replaceAll } from "../data/storage";
import { sampleData } from "../data/sampleData";
import { countTotals, latestClosedCount } from "../data/inventory";
import { invoiceTotal, suggestions } from "../data/purchasing";
import { missingPrices } from "../data/costing";
import { findById, formatAmount, plural, formatMoney, formatPercent } from "../data/utils";
import { closedCounts, varianceReport } from "../data/variance";
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

    // The last period: between the two most recent finished counts
    const closed = closedCounts();
    const report = closed.length >= 2 ? varianceReport(closed.at(-2)!.id, closed.at(-1)!.id) : null;
    const hasSales = report !== null && report.salesReports > 0;
    const missingDollars = report === null ? 0
        : report.rows.reduce((sum, r) => sum + (r.unitCost !== null && r.variance > 0 ? r.variance * r.unitCost : 0), 0);
    const period = report ? shortDay(report.opening.countedAt) + " – " + shortDay(report.closing.countedAt) : "";

    // Four numbers that matter, each a door to the page behind it
    const tiles = [
        {
            label: "Pour cost", to: "/reports",
            value: hasSales && report!.pourCost !== null ? formatPercent(report!.pourCost) : "—",
            note: hasSales && report!.idealPourCost !== null ? "should be " + formatPercent(report!.idealPourCost) : "needs 2 counts + sales",
            bad: hasSales && report!.pourCost !== null && report!.idealPourCost !== null && report!.pourCost - report!.idealPourCost > 0.02
        },
        {
            label: "Missing", to: "/reports",
            value: hasSales ? formatMoney(missingDollars) : "—",
            note: hasSales ? period : "poured but not rung in",
            bad: hasSales && missingDollars > 0
        },
        {
            label: "Sales", to: "/sales",
            value: hasSales ? formatMoney(report!.sales) : "—",
            note: hasSales ? period : "import or connect your POS",
            bad: false
        },
        {
            label: "On the shelf", to: "/counts",
            value: latest ? formatMoney(countTotals(latest.id).value) : "—",
            note: latest ? "counted " + shortDay(latest.countedAt) : "no finished count yet",
            bad: false
        }
    ];
    const starting = db.recipes.length === 0 || db.products.length === 0;

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
        <div className="page menu-page tile-page">
            <div className="page-header">
                <h1>Numbers</h1>
            </div>

            <div className="number-tiles">
                {tiles.map((t) => (
                    <Link key={t.label} to={t.to} className={"number-tile" + (t.bad ? " bad" : "")}>
                        <span className="muted small">{t.label}</span>
                        <strong>{t.value}</strong>
                        <span className="muted small">{t.note}</span>
                    </Link>
                ))}
            </div>

            {todo.length > 0 && (
                <>
                    <h2 className="section-label">Needs attention</h2>
                    <ul className="card menu-lines">
                        {todo.map((t) => (
                            <li key={t.text} className="menu-line">
                                <Link to={t.to} className="menu-line-row menu-list-row todo-row">
                                    <span className="todo-dot" aria-hidden="true" />
                                    <span className="menu-list-name todo-text">{t.text}</span>
                                    <span className="todo-action">{t.action}</span>
                                    <span className="chevron" aria-hidden="true">›</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {/* What's in Agave, small, at the bottom */}
            <div className="what-chips">
                <Link to="/recipes" className="chip">{plural(db.recipes.length, "recipe")}</Link>
                <Link to="/menus" className="chip">{plural(db.menus.length, "menu")}</Link>
                <Link to="/products" className="chip">{plural(db.products.length, "product")}</Link>
                <Link to="/vendors" className="chip">{plural(db.vendors.length, "vendor")}</Link>
            </div>

            {/* Getting started only until there are recipes and products */}
            {starting && (
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
            )}
        </div>
    );
}

// "Nov 15"
function shortDay(day: string): string {
    return new Date(day.slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
