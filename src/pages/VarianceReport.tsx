// ===== VarianceReport.tsx =====
// SOLD vs USED between two finished counts: the report that finds lost money.
//     Top:    pour cost (actual), ideal pour cost, $ missing, $ wasted
//     Middle: how the cost of goods adds up (opening + delivered - closing = used)
//     Table:  every product, biggest $ loss first; red = more than 5% missing
// Needs: two finished counts, and a sales report whose last day falls between them.

import { useState } from "react";
import { Link } from "react-router";
import { db as currentDb, useDb } from "../data/storage";
import { closedCounts, varianceReport, type VarianceReport as Report } from "../data/variance";
import { formatLabel, unitWord } from "../data/inventory";
import { download, toCsv } from "../data/csv";
import { findById, formatAmount, formatDate, formatMoney, formatPercent } from "../data/utils";

// A product is flagged when more than 5% of what was used is unaccounted for (and it's worth more than $5)
const FLAG_SHARE = 0.05;
const FLAG_DOLLARS = 5;

export default function VarianceReport() {
    const db = useDb();
    const counts = closedCounts();
    const [openingId, setOpeningId] = useState(counts.at(-2)?.id ?? "");
    const [closingId, setClosingId] = useState(counts.at(-1)?.id ?? "");

    if (counts.length < 2) {
        return (
            <div className="page">
                <div className="page-header"><h1>Variance</h1></div>
                <section className="card">
                    <h2>Two finished counts needed</h2>
                    <p>Variance compares what you sold with what you used between two counts. Finish a <Link to="/counts">stock count</Link>,
                        then another one at the end of the week, and import the week's <Link to="/sales">sales</Link>.</p>
                </section>
            </div>
        );
    }

    const report = varianceReport(openingId, closingId);
    const label = (id: string) => {
        const c = findById(db.stockCounts, id);
        return c ? formatDate(c.countedAt) + " · " + c.name : "";
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Variance</h1>
                    <p className="muted">What you sold vs what you used. A missing bottle shows up here as dollars.</p>
                </div>
                {report && <button className="secondary" onClick={() => exportCsv(report)}>Export CSV</button>}
            </div>

            <div className="toolbar">
                <label className="inline-label">From count
                    <select value={openingId} onChange={(e) => setOpeningId(e.target.value)}>
                        {counts.map((c) => <option key={c.id} value={c.id}>{label(c.id)}</option>)}
                    </select>
                </label>
                <label className="inline-label">To count
                    <select value={closingId} onChange={(e) => setClosingId(e.target.value)}>
                        {counts.map((c) => <option key={c.id} value={c.id}>{label(c.id)}</option>)}
                    </select>
                </label>
            </div>

            {report === null ? (
                <section className="card warn-box">Pick a "to" count that's later than the "from" count.</section>
            ) : (
                <ReportBody report={report} />
            )}
        </div>
    );
}


function ReportBody({ report }: { report: Report }) {
    const db = useDb();
    const missing = report.varianceValue;

    return (
        <>
            {report.salesReports === 0 && (
                <section className="card warn-box">
                    No sales report ends between these counts, so everything used shows as missing. <Link to="/sales">Import sales</Link> for {formatDate(report.opening.countedAt)} to {formatDate(report.closing.countedAt)}.
                </section>
            )}
            {report.unmatchedSales > 0 && (
                <section className="card warn-box">
                    {report.unmatchedSales} POS {report.unmatchedSales === 1 ? "item isn't" : "items aren't"} matched to a recipe, so {report.unmatchedSales === 1 ? "its" : "their"} usage counts as missing. <Link to="/sales">Match them</Link>.
                </section>
            )}

            <div className="stat-row">
                <div className="stat">
                    <span className="stat-label">Pour cost</span>
                    <span className="stat-value">{report.pourCost === null ? "—" : formatPercent(report.pourCost)}</span>
                    <span className="stat-ratio">what was used ÷ sales</span>
                </div>
                <div className="stat">
                    <span className="stat-label">Ideal pour cost</span>
                    <span className="stat-value">{report.idealPourCost === null ? "—" : formatPercent(report.idealPourCost)}</span>
                    <span className="stat-ratio">if every pour were perfect</span>
                </div>
                <div className={"stat" + (missing > FLAG_DOLLARS ? " warn" : "")}>
                    <span className="stat-label">{missing >= 0 ? "Missing" : "Extra"}</span>
                    <span className="stat-value">{formatMoney(Math.abs(missing))}</span>
                    <span className="stat-ratio">{report.usedValue > 0 ? formatPercent(Math.abs(missing) / report.usedValue) + " of what was used" : ""}</span>
                </div>
                <div className="stat">
                    <span className="stat-label">Logged waste</span>
                    <span className="stat-value">{formatMoney(report.wasteValue)}</span>
                    <span className="stat-ratio"><Link to="/waste">waste log</Link></span>
                </div>
                <div className="stat">
                    <span className="stat-label">Sales</span>
                    <span className="stat-value">{formatMoney(report.sales)}</span>
                    <span className="stat-ratio">{report.salesReports} {report.salesReports === 1 ? "report" : "reports"}</span>
                </div>
            </div>

            <section className="card">
                <h2>How the cost adds up</h2>
                <table className="table compact flow-table">
                    <tbody>
                        <tr><td>Opening stock ({formatDate(report.opening.countedAt)})</td><td className="num">{formatMoney(report.openingValue)}</td></tr>
                        <tr><td>+ Delivered (invoices in the period)</td><td className="num">{formatMoney(report.purchasesValue)}</td></tr>
                        <tr><td>− Closing stock ({formatDate(report.closing.countedAt)})</td><td className="num">{formatMoney(report.closingValue)}</td></tr>
                        <tr className="total"><td><strong>= Used</strong></td><td className="num"><strong>{formatMoney(report.usedValue)}</strong></td></tr>
                        <tr><td>Should have used (from sales)</td><td className="num">{formatMoney(report.theoreticalValue)}</td></tr>
                        <tr><td>Logged waste</td><td className="num">{formatMoney(report.wasteValue)}</td></tr>
                        <tr className="total"><td><strong>Unaccounted for</strong></td><td className={"num" + (missing > FLAG_DOLLARS ? " warn" : "")}><strong>{formatMoney(missing)}</strong></td></tr>
                    </tbody>
                </table>
                <p className="muted small">Delivered uses invoice prices; stock and usage use current costs, so the two halves can differ slightly.</p>
                {report.suppliesValue > 0 && (
                    <p className="muted small">Supplies (paper, cleaning, smallwares) bought in this period: {formatMoney(report.suppliesValue)}. They're left out of pour cost and variance.</p>
                )}
            </section>

            <section className="card table-card">
                <h2>By product</h2>
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th className="num">Used</th>
                                <th className="num hide-phone">Should have</th>
                                <th className="num hide-phone">Waste</th>
                                <th className="num">Missing</th>
                                <th className="num">$</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.rows.map((row) => {
                                const format = findById(db.formats, row.formatId)!;
                                const dollars = row.unitCost === null ? null : row.variance * row.unitCost;
                                const share = row.actual > 0 ? row.variance / row.actual : 0;
                                const flagged = dollars !== null && dollars > FLAG_DOLLARS && share > FLAG_SHARE;
                                return (
                                    <tr key={row.formatId} className={flagged ? "flagged" : ""}>
                                        <td><Link to={"/products/" + format.productId}>{formatLabel(format)}</Link>
                                            <div className="muted small hide-phone">{formatAmount(round(row.opening))} + {formatAmount(round(row.purchased))} − {formatAmount(round(row.closing))}</div></td>
                                        <td className="num">{formatAmount(round(row.actual))} <span className="muted small">{unitWord(format)}{round(row.actual) === 1 ? "" : "s"}</span></td>
                                        <td className="num hide-phone">{formatAmount(round(row.theoretical))}</td>
                                        <td className="num hide-phone">{row.waste > 0 ? formatAmount(round(row.waste)) : "—"}</td>
                                        <td className={"num" + (flagged ? " warn" : "")}>
                                            {formatAmount(round(row.variance))}
                                            {row.actual > 0 && <div className="small">{formatPercent(share)}</div>}
                                        </td>
                                        <td className={"num" + (flagged ? " warn" : "")}>{dollars === null ? "—" : formatMoney(dollars)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            {report.splitReports.length > 0 && (
                <section className="card">
                    <h2>Sales cross a count</h2>
                    <p className="muted small">These sales reports start before the opening count, so some of their sales belong to the last period: {report.splitReports.join(", ")}. Import sales a day at a time (or connect Square or Toast) and any count day works.</p>
                </section>
            )}

            {report.problems.length > 0 && (
                <section className="card">
                    <h2>Couldn't trace</h2>
                    <p className="muted small">These recipe ingredients have no product or prep to follow, so their usage isn't counted: {report.problems.join(", ")}.</p>
                </section>
            )}
            <p className="muted small">Missing = used − should have used − waste. Positive means product left without being rung in (overpouring, giveaways, theft, missed invoices); negative means more was rung in than poured.</p>
        </>
    );
}

// 2 decimals is plenty for bottles
function round(n: number): number {
    return Math.round(n * 100) / 100;
}

// Save the report as a spreadsheet
function exportCsv(report: Report) {
    const rows: (string | number | null)[][] = [["Product", "Opening", "Delivered", "Closing", "Used", "Should have used", "Waste", "Missing", "Unit cost", "Missing $"]];
    for (const r of report.rows) {
        const format = findById(currentDb.formats, r.formatId);
        rows.push([format ? formatLabel(format) : "?", round(r.opening), round(r.purchased), round(r.closing), round(r.actual), round(r.theoretical),
            round(r.waste), round(r.variance), r.unitCost === null ? null : round(r.unitCost), r.unitCost === null ? null : round(r.variance * r.unitCost)]);
    }
    download("variance-" + report.opening.countedAt + "-to-" + report.closing.countedAt + ".csv", toCsv(rows));
}
