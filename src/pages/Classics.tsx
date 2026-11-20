// ===== Classics.tsx =====
// A library of classic cocktail specs to start from.
//     Search or filter by style
//     "Add to my recipes" copies one in, costed with your own products, ready to tweak
//     "Add all in this list" for a bar setting up from scratch

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { addClassic, CLASSIC_STYLES, CLASSICS, hasRecipeNamed, type Classic, type ClassicStyle } from "../data/classics";
import { formatFraction } from "../data/utils";
import { useSession } from "../cloud/session";
import { canEdit } from "../cloud/access";

export default function Classics() {
    useDb();   // redraw after adding, so "In your recipes" updates
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [style, setStyle] = useState<ClassicStyle | "all">("all");
    const editable = canEdit(useSession().bar?.role ?? null);   // staff can read, not add

    // A classic shows IF it's in the chosen style AND its name or an ingredient matches the search
    const words = search.trim().toLowerCase();
    const shown = CLASSICS.filter((c) =>
        (style === "all" || c.style === style)
        && (words === "" || c.name.toLowerCase().includes(words) || c.build.some(([, , name]) => name.toLowerCase().includes(words))));

    function addAll() {
        const missing = shown.filter((c) => !hasRecipeNamed(c.name));
        if (missing.length === 0) return;
        if (!confirm("Add " + missing.length + " classics to your recipes?")) return;
        for (const classic of missing) addClassic(classic);
    }

    return (
        <div className="page">
            <Link to="/training" className="back">← Training</Link>
            <div className="page-header">
                <div>
                    <h1>Classics library</h1>
                    <p className="muted">{CLASSICS.length} classic specs. Add one and it's costed with your products, ready to make your own.</p>
                </div>
            </div>

            <div className="training-controls">
                <input type="search" placeholder="Search by name or ingredient (e.g. gin)" aria-label="Search classics"
                    value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="tab-row compact" role="tablist">
                    {(["all", ...CLASSIC_STYLES] as const).map((s) => (
                        <button key={s} role="tab" aria-selected={style === s} className={"tab" + (style === s ? " active" : "")}
                            onClick={() => setStyle(s)}>{s === "all" ? "All" : s}</button>
                    ))}
                </div>
            </div>

            <div className="classic-grid">
                {shown.map((classic) => (
                    <ClassicCard key={classic.name} classic={classic} editable={editable} onAdd={() => navigate("/recipes/" + addClassic(classic))} />
                ))}
            </div>
            {shown.length === 0 && <p className="muted">No classics match.</p>}
            {shown.length > 1 && editable && (
                <div className="button-row">
                    <button className="secondary" onClick={addAll}>Add all {shown.length} shown to my recipes</button>
                </div>
            )}
        </div>
    );
}

function ClassicCard({ classic, editable, onAdd }: { classic: Classic; editable: boolean; onAdd: () => void }) {
    const have = hasRecipeNamed(classic.name);
    return (
        <article className="card classic">
            <div className="card-header">
                <h2>{classic.name}</h2>
                <span className="tag">{classic.style}</span>
            </div>
            <p className="muted small">{classic.description}</p>
            <ul className="spec-build">
                {classic.build.map(([amount, unit, name], i) => (
                    <li key={i}><span className="spec-amount">{formatFraction(amount)} {unit}</span> {name}</li>
                ))}
            </ul>
            <div className="spec-meta small">
                <span><span className="field-label">Glass</span> {classic.glass}</span>
                <span><span className="field-label">Garnish</span> {classic.garnish}</span>
            </div>
            <p className="small">{classic.directions}</p>
            {editable && <div className="button-row">
                <button className={have ? "secondary" : ""} onClick={onAdd}>{have ? "Add another copy" : "Add to my recipes"}</button>
                {have && <span className="status status-done">In your recipes</span>}
            </div>}
        </article>
    );
}
