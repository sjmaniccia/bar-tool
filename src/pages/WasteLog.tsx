// ===== WasteLog.tsx =====
// Log what's used without being sold: a dropped bottle, a comped round, a returned drink.
// Logged waste is subtracted on the variance report, so it doesn't look like theft,
// and the reasons show where the money goes.

import { useState, type FormEvent } from "react";
import { useDb } from "../data/storage";
import { addWaste, deleteWaste, wasteValue } from "../data/variance";
import { formatLabel } from "../data/inventory";
import { findById, formatAmount, formatDate, formatMoney, parseAmount, today } from "../data/utils";
import type { WasteReason } from "../data/types";

const REASONS: { value: WasteReason; label: string }[] = [
    { value: "spill", label: "Spill" },
    { value: "comp", label: "Comp" },
    { value: "returned", label: "Sent back" },
    { value: "breakage", label: "Broken" },
    { value: "expired", label: "Expired" },
    { value: "other", label: "Other" }
];

export default function WasteLog() {
    const db = useDb();
    const [kind, setKind] = useState<"recipe" | "product">("recipe");
    const [form, setForm] = useState({ date: today(), itemId: "", quantity: "1", reason: "comp" as WasteReason, note: "" });
    const [error, setError] = useState("");

    const recipes = db.recipes.filter((r) => r.type !== "Prep").sort((a, b) => a.name.localeCompare(b.name));
    const formats = db.formats
        .map((f) => ({ f, label: formatLabel(f) }))
        .sort((a, b) => a.label.localeCompare(b.label));
    const entries = [...db.wasteEntries].sort((a, b) => b.date.localeCompare(a.date));

    // CHECK something is picked and the amount is a number above 0, then log it
    function submit(event: FormEvent) {
        event.preventDefault();
        const quantity = parseAmount(form.quantity);
        if (form.itemId === "") return setError(kind === "recipe" ? "Pick a drink or dish." : "Pick a product.");
        if (isNaN(quantity) || quantity <= 0) return setError("Enter how many, like 1 or 1/2.");
        addWaste({
            date: form.date, kind,
            formatId: kind === "product" ? form.itemId : null,
            recipeId: kind === "recipe" ? form.itemId : null,
            quantity, reason: form.reason, note: form.note.trim()
        });
        setForm({ ...form, itemId: "", quantity: "1", note: "" });
        setError("");
    }

    // Totals by reason for the last 30 days
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const byReason = new Map<string, number>();
    for (const entry of entries.filter((e) => e.date >= since)) {
        byReason.set(entry.reason, (byReason.get(entry.reason) ?? 0) + (wasteValue(entry) ?? 0));
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Waste log</h1>
                    <p className="muted">Spills, comps and breakage. Logged waste is taken out of the variance, so it isn't counted as missing.</p>
                </div>
            </div>

            <section className="card">
                <h2>Log waste</h2>
                <div className="tab-row compact" role="tablist">
                    <button role="tab" aria-selected={kind === "recipe"} className={"tab" + (kind === "recipe" ? " active" : "")}
                        onClick={() => { setKind("recipe"); setForm({ ...form, itemId: "", reason: "comp" }); }}>A drink or dish</button>
                    <button role="tab" aria-selected={kind === "product"} className={"tab" + (kind === "product" ? " active" : "")}
                        onClick={() => { setKind("product"); setForm({ ...form, itemId: "", reason: "breakage" }); }}>A product</button>
                </div>
                <form className="form-grid four" onSubmit={submit}>
                    <label className="form-field span-2"><span>{kind === "recipe" ? "Drink or dish" : "Product"}</span>
                        <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })}>
                            <option value="">Choose…</option>
                            {kind === "recipe"
                                ? recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)
                                : formats.map(({ f, label }) => <option key={f.id} value={f.id}>{label}</option>)}
                        </select></label>
                    <label className="form-field"><span>{kind === "recipe" ? "How many" : "How many (bottles, bags…)"}</span>
                        <input value={form.quantity} inputMode="decimal" onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
                    <label className="form-field"><span>Reason</span>
                        <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value as WasteReason })}>
                            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select></label>
                    <label className="form-field"><span>Date</span>
                        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
                    <label className="form-field span-2"><span>Note</span>
                        <input value={form.note} placeholder="Birthday table, dropped on restock…" onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
                    <div className="form-field"><span>&nbsp;</span><button type="submit">Log it</button></div>
                    {error && <p className="error span-2">{error}</p>}
                </form>
            </section>

            {byReason.size > 0 && (
                <div className="stat-row">
                    {REASONS.filter((r) => byReason.has(r.value)).map((r) => (
                        <div key={r.value} className="stat">
                            <span className="stat-label">{r.label}</span>
                            <span className="stat-value">{formatMoney(byReason.get(r.value)!)}</span>
                            <span className="stat-ratio">last 30 days</span>
                        </div>
                    ))}
                </div>
            )}

            <section className="card table-card">
                <h2>Entries</h2>
                {entries.length === 0 ? <p className="card-pad muted">Nothing logged yet.</p> : (
                    <div className="table-scroll">
                        <table className="table">
                            <thead><tr><th>Date</th><th>What</th><th className="num">How many</th><th>Reason</th><th className="num">Cost</th><th></th></tr></thead>
                            <tbody>
                                {entries.map((entry) => {
                                    const value = wasteValue(entry);
                                    const format = findById(db.formats, entry.formatId);
                                    const recipe = findById(db.recipes, entry.recipeId);
                                    return (
                                        <tr key={entry.id}>
                                            <td className="nowrap">{formatDate(entry.date)}</td>
                                            <td>{recipe ? recipe.name : format ? formatLabel(format) : "?"}{entry.note && <div className="muted small">{entry.note}</div>}</td>
                                            <td className="num">{formatAmount(entry.quantity)}</td>
                                            <td><span className="tag">{REASONS.find((r) => r.value === entry.reason)?.label}</span></td>
                                            <td className="num">{value === null ? "—" : formatMoney(value)}</td>
                                            <td className="num"><button className="danger icon-button" aria-label="Delete entry" onClick={() => deleteWaste(entry.id)}>✕</button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
