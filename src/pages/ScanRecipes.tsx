// ===== ScanRecipes.tsx =====
// Digitize a bar's recipe book: photograph the pages, check what Claude read, save.
//
//     1. PHOTOS   up to 30 pages at a time (one recipe or a whole spec sheet per page)
//     2. READ     each page is read on its own, two at a time, so recipes show up as
//                 pages finish and one bad photo doesn't stop the rest (it can be retried)
//     3. CHECK    every recipe as a card: name, type, glass, garnish, price, method, and
//                 each ingredient matched to the bar's ingredients:
//                     (no tag)   the same name
//                     "check"    a close name or a product's name: make sure it's right
//                     "new"      a new ingredient, made when saved
//                 recipes the bar already has start un-ticked
//     4. SAVE     the ticked recipes (prep recipes first, so cocktails can use them)

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useDb } from "../data/storage";
import { useSession } from "../cloud/session";
import { limitReached, MAX_RECIPE_PAGES, scanRecipePage, scanUsage, shrinkPhoto, type ScanUsage } from "../cloud/scan";
import {
    buildRecipeDrafts, newIngredientNames, saveRecipeDrafts,
    type IngredientHow, type RecipeDraft, type RecipeDraftLine
} from "../data/recipeScan";
import { PURCHASE_UNITS, YIELD_UNITS } from "../data/units";
import { findById } from "../data/utils";
import type { RecipeType } from "../data/types";
import AmountInput from "../components/AmountInput";
import PhotoPicker from "../components/PhotoPicker";

const NEW = "__new";
const AT_ONCE = 2;
const TYPES: RecipeType[] = ["Cocktail", "Dish", "Beer", "Prep"];

type PageStatus = "waiting" | "reading" | "done" | "failed";

interface PageState {
    file: File;
    status: PageStatus;
    message: string;          // the error, or "2 recipes"
}

const HOW_TAG: Partial<Record<IngredientHow, { text: string; className: string; title: string }>> = {
    suggested: { text: "check", className: "tag", title: "A close match. Make sure it's the right ingredient." },
    new: { text: "new", className: "tag warn-tag", title: "Not in Agave yet. It'll be added when you save." }
};

export default function ScanRecipes() {
    const db = useDb();
    const session = useSession();
    const [files, setFiles] = useState<File[]>([]);
    const [pages, setPages] = useState<PageState[]>([]);
    const [drafts, setDrafts] = useState<RecipeDraft[]>([]);
    const [error, setError] = useState("");
    const [usage, setUsage] = useState<ScanUsage | null>(null);
    const [saved, setSaved] = useState<string[] | null>(null);
    const barId = session.mode === "ready" ? session.bar?.id ?? null : null;

    useEffect(() => {
        if (!barId) return;
        let current = true;
        void scanUsage(barId, "recipe").then((u) => { if (current) setUsage(u); });
        return () => { current = false; };
    }, [barId]);

    const ingredientOptions = useMemo(
        () => [...db.ingredients].sort((a, b) => a.name.localeCompare(b.name)),
        [db.ingredients]
    );

    if (!barId) {
        return (
            <div className="page">
                <h1>Scan recipes</h1>
                <section className="card card-pad-all">
                    <p>Sign in to scan recipes. The photos are read on Agave's server, which the demo doesn't use.</p>
                    <p className="muted small">You can still <Link to="/recipes">add recipes by hand</Link> or start from the <Link to="/classics">classics library</Link>.</p>
                </section>
            </div>
        );
    }
    const atLimit = limitReached(usage, "recipe");
    const reading = pages.some((p) => p.status === "waiting" || p.status === "reading");

    // Read the given pages, AT_ONCE at a time; each page's recipes appear as soon as it's done
    async function readPages(indexes: number[], list: PageState[]) {
        let next = 0;
        const setPage = (i: number, change: Partial<PageState>) =>
            setPages((current) => current.map((p, j) => (j === i ? { ...p, ...change } : p)));
        async function worker() {
            while (next < indexes.length) {
                const i = indexes[next++];
                setPage(i, { status: "reading", message: "" });
                try {
                    const reply = await scanRecipePage(barId!, await shrinkPhoto(list[i].file));
                    if (reply.usage) setUsage(reply.usage);
                    if (!reply.ok) {
                        setPage(i, { status: "failed", message: reply.error });
                        continue;
                    }
                    const found = buildRecipeDrafts(reply.recipes, i + 1);
                    setDrafts((current) => [...current.filter((d) => d.page !== i + 1), ...found].sort((a, b) => a.page - b.page));
                    const count = found.length + (found.length === 1 ? " recipe" : " recipes");
                    setPage(i, { status: "done", message: reply.warnings.length > 0 ? count + ". " + reply.warnings.join(" ") : count });
                } catch (e) {
                    setPage(i, { status: "failed", message: e instanceof Error ? e.message : String(e) });
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(AT_ONCE, indexes.length) }, worker));
    }

    function start() {
        const list = files.map((file) => ({ file, status: "waiting" as PageStatus, message: "" }));
        setPages(list);
        setDrafts([]);
        setSaved(null);
        void readPages(list.map((_, i) => i), list);
    }

    function retryFailed() {
        const failed = pages.map((p, i) => (p.status === "failed" ? i : -1)).filter((i) => i >= 0);
        void readPages(failed, pages);
    }

    function setDraft(key: string, change: Partial<RecipeDraft>) {
        setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...change } : d)));
    }

    function setLine(key: string, index: number, change: Partial<RecipeDraftLine>) {
        setDrafts((current) => current.map((d) => (d.key === key
            ? { ...d, lines: d.lines.map((l, i) => (i === index ? { ...l, ...change } : l)) }
            : d)));
    }

    function save() {
        const ids = saveRecipeDrafts(drafts);
        setSaved(ids);
        setDrafts([]);
        setPages([]);
        setFiles([]);
    }

    function startOver() {
        if (drafts.length > 0 && !confirm("Start over? The recipes read so far won't be saved.")) return;
        setPages([]);
        setDrafts([]);
        setFiles([]);
        setSaved(null);
    }

    // ===== After saving =====
    if (saved !== null) {
        return (
            <div className="page">
                <h1>Saved {saved.length} {saved.length === 1 ? "recipe" : "recipes"}</h1>
                <section className="card card-pad-all">
                    <ul className="plain-list">
                        {saved.map((id) => {
                            const r = findById(db.recipes, id);
                            return r && <li key={id}><Link to={"/recipes/" + id}>{r.name}</Link> <span className="muted small">{r.type}</span></li>;
                        })}
                    </ul>
                    <p className="muted small">
                        New ingredients have no cost until they're linked to a product or a prep recipe.
                        Set them up on the <Link to="/ingredients">Ingredients</Link> page, and recipe costs fill in.
                    </p>
                    <div className="button-row">
                        <button onClick={() => setSaved(null)}>Scan more pages</button>
                        <Link className="button secondary" to="/recipes">All Recipes</Link>
                    </div>
                </section>
            </div>
        );
    }

    // ===== Choosing photos =====
    if (pages.length === 0) {
        return (
            <div className="page">
                <div className="page-header">
                    <div>
                        <h1>Scan recipes</h1>
                        <p className="muted">Photograph each page of your recipe book or spec sheets. Several recipes on one page is fine.</p>
                    </div>
                </div>
                <section className="card scan-card">
                    <PhotoPicker files={files} onChange={setFiles} onReject={setError} max={MAX_RECIPE_PAGES} />
                    {(error || atLimit) && <p className="error" role="alert">{error || atLimit}</p>}
                    <div className="button-row">
                        <button disabled={files.length === 0 || atLimit !== null} onClick={start}>
                            Read {files.length === 0 ? "pages" : files.length === 1 ? "1 page" : files.length + " pages"}
                        </button>
                        {usage && (
                            <span className="muted small scan-usage">
                                {usage.month} of {usage.monthlyLimit} recipe pages used this month · {usage.today} of {usage.dailyLimit} today
                            </span>
                        )}
                    </div>
                </section>
                <p className="muted small">
                    The photos go to Agave's server and to Claude (Anthropic) to be read, then they're thrown away.
                    Nothing is saved until you press Save. Pictures of the drinks aren't kept yet.
                </p>
            </div>
        );
    }

    // ===== Reading and checking =====
    const chosen = drafts.filter((d) => d.include);
    const newNames = newIngredientNames(drafts);
    const done = pages.filter((p) => p.status === "done").length;
    const failed = pages.filter((p) => p.status === "failed").length;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Check the recipes</h1>
                    <p className="muted">
                        {reading ? "Reading page " + Math.min(done + failed + 1, pages.length) + " of " + pages.length + "… recipes show up as each page finishes." : "Read " + done + " of " + pages.length + " pages."}
                    </p>
                </div>
                <div className="button-row">
                    <button className="secondary" onClick={startOver}>Start over</button>
                    <button onClick={save} disabled={reading || chosen.length === 0}>Save {chosen.length} {chosen.length === 1 ? "recipe" : "recipes"}</button>
                </div>
            </div>

            <section className="card scan-pages">
                {pages.map((p, i) => (
                    <div key={i} className={"scan-page " + p.status}>
                        <strong>Page {i + 1}</strong>
                        <span className="small">{p.status === "waiting" ? "waiting" : p.status === "reading" ? "reading…" : p.message}</span>
                    </div>
                ))}
                {!reading && failed > 0 && <button className="secondary" onClick={retryFailed}>Try the {failed} failed {failed === 1 ? "page" : "pages"} again</button>}
            </section>

            {newNames.length > 0 && (
                <section className="card card-pad-all scan-fill">
                    <div>
                        <strong>{newNames.length} new {newNames.length === 1 ? "ingredient" : "ingredients"} will be added.</strong>
                        <span className="muted small"> {newNames.join(", ")}. If one is really something you have under another name, pick it on the recipe.</span>
                    </div>
                </section>
            )}

            {drafts.map((d) => (
                <section key={d.key} className={"card recipe-scan" + (d.include ? "" : " left-out")}>
                    <div className="recipe-scan-head">
                        <label className="recipe-scan-include">
                            <input type="checkbox" checked={d.include} onChange={(e) => setDraft(d.key, { include: e.target.checked })} aria-label={"Save " + d.name} />
                        </label>
                        <input className="recipe-scan-name" value={d.name} aria-label="Recipe name" onChange={(e) => setDraft(d.key, { name: e.target.value })} />
                        <select value={d.type} aria-label="Type" onChange={(e) => setDraft(d.key, { type: e.target.value as RecipeType })}>
                            {TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                        <span className="tag">page {d.page}</span>
                        {d.hasPhoto && <span className="tag" title="There's a picture of this one on the page. Agave doesn't keep pictures yet.">has a photo</span>}
                    </div>
                    {d.duplicateOf && (
                        <p className="warn small recipe-scan-dup">
                            You already have <Link to={"/recipes/" + d.duplicateOf}>{findById(db.recipes, d.duplicateOf)?.name}</Link>.
                            {d.include ? " This one will be saved as \"" + d.name + " (scanned)\"." : " Tick it to save this one too."}
                        </p>
                    )}

                    <div className="recipe-scan-fields">
                        <label><span className="small muted">Glass</span>
                            <input value={d.glass} onChange={(e) => setDraft(d.key, { glass: e.target.value })} /></label>
                        <label><span className="small muted">Garnish</span>
                            <input value={d.garnish} onChange={(e) => setDraft(d.key, { garnish: e.target.value })} /></label>
                        <label><span className="small muted">Menu price</span>
                            <AmountInput value={d.menuPrice} money allowBlank placeholder="—" ariaLabel="Menu price" onSave={(menuPrice) => setDraft(d.key, { menuPrice })} /></label>
                        {d.type === "Prep" && (
                            <label><span className="small muted">Batch makes</span>
                                <span className="recipe-scan-yield">
                                    <AmountInput value={d.yieldAmount} className="qty-input" ariaLabel="Batch size" onSave={(v) => v !== null && setDraft(d.key, { yieldAmount: v })} />
                                    <select value={d.yieldUnit} aria-label="Batch unit" onChange={(e) => setDraft(d.key, { yieldUnit: e.target.value })}>
                                        {YIELD_UNITS.map((u) => <option key={u}>{u}</option>)}
                                    </select>
                                </span>
                            </label>
                        )}
                    </div>

                    <table className="table recipe-scan-lines">
                        <tbody>
                            {d.lines.map((line, i) => {
                                const tag = HOW_TAG[line.how];
                                return (
                                    <tr key={i}>
                                        <td className="num">
                                            <AmountInput value={line.amount} allowBlank placeholder={line.scanned.note || "—"} className="qty-input" ariaLabel="Amount"
                                                onSave={(amount) => setLine(d.key, i, { amount, unit: amount === null ? "" : line.unit || "fl oz" })} />
                                        </td>
                                        <td>
                                            <select value={line.unit} aria-label="Unit" onChange={(e) => setLine(d.key, i, { unit: e.target.value })}>
                                                <option value="">—</option>
                                                {PURCHASE_UNITS.map((u) => <option key={u}>{u}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            <div className="scan-pick">
                                                <select aria-label={"Ingredient for " + line.scanned.name} value={line.ingredientId ?? NEW}
                                                    onChange={(e) => setLine(d.key, i, e.target.value === NEW
                                                        ? { ingredientId: null, how: "new" }
                                                        : { ingredientId: e.target.value, how: "picked" })}>
                                                    <option value={NEW}>New: {line.newName}</option>
                                                    {ingredientOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                                                </select>
                                                {tag && <span className={tag.className} title={tag.title}>{tag.text}</span>}
                                            </div>
                                            {line.how !== "exact" && line.scanned.name.toLowerCase() !== (findById(db.ingredients, line.ingredientId)?.name ?? line.newName).toLowerCase() && (
                                                <div className="muted small">written: {line.scanned.name}</div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <label className="recipe-scan-method">
                        <span className="small muted">Method</span>
                        <textarea rows={2} value={d.directions} onChange={(e) => setDraft(d.key, { directions: e.target.value })} />
                    </label>
                </section>
            ))}

            {!reading && drafts.length === 0 && (
                <section className="card card-pad-all"><p className="muted">No recipes were found on these pages.</p></section>
            )}
        </div>
    );
}
