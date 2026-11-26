// ===== ScanRecipes.tsx =====
// Digitize a bar's recipe book: photograph the pages, check what Claude read, save.
//
//     1. PHOTOS   up to 30 pages at a time (one recipe or a whole spec sheet per page)
//     2. READ     each page is read on its own, two at a time, so recipes show up as
//                 pages finish and one bad photo doesn't stop the rest (it can be retried)
//     3. CHECK    every recipe as one compact card that reads like the recipe itself:
//                 picture, name, serves, each ingredient line ("2 onions, chopped"), directions.
//                 A small pencil opens just that line (or the recipe's details) to fix it.
//                 Tags on a line:
//                     "unit?"    a number with no unit ("2 onions"): tap to open the line,
//                                pick a unit or keep "count", then Done
//                     "check"    a close name or a product's name: make sure it's right (costing places)
//                     "new"      a new ingredient, made when saved (costing places)
//                 recipes the place already has start un-ticked
//                 a "Just recipes" place sees no ingredient matching, prices or glassware
//     4. SAVE     the pictures are kept (Supabase Storage), then the ticked recipes
//                 (prep recipes first, so cocktails can use them)

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useDb } from "../data/storage";
import { useSession } from "../cloud/session";
import { limitReached, MAX_RECIPE_PAGES, scanRecipePage, scanUsage, shrinkPhoto, type ScanUsage } from "../cloud/scan";
import { cropPhoto, savePhoto } from "../cloud/photos";
import { celebrate, playSound, toast } from "../feedback";
import {
    buildRecipeDrafts, draftLineName, newIngredientNames, saveRecipeDrafts,
    type IngredientHow, type RecipeDraft, type RecipeDraftLine
} from "../data/recipeScan";
import { lineText, unitLabel } from "../data/lineText";
import { useRecipesOnly } from "../data/place";
import { formatFraction, formatMoney } from "../data/utils";
import type { Ingredient } from "../data/types";
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
    const [saving, setSaving] = useState("");     // "Saving pictures 2 of 5…" while saving
    const barId = session.mode === "ready" ? session.bar?.id ?? null : null;
    const recipesOnly = useRecipesOnly();

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
                    const found = buildRecipeDrafts(reply.recipes, i + 1, recipesOnly);
                    // Cut each recipe's picture out of the full-size photo (sharper than what was sent)
                    for (let k = 0; k < found.length; k++) {
                        const box = reply.recipes[k].photoBox;
                        if (!box) continue;
                        try {
                            const blob = await cropPhoto(list[i].file, box);
                            found[k] = { ...found[k], photoBlob: blob, photo: URL.createObjectURL(blob) };
                        } catch { /* no picture then */ }
                    }
                    setDrafts((current) => [...current.filter((d) => d.page !== i + 1), ...found].sort((a, b) => a.page - b.page));
                    const count = found.length + (found.length === 1 ? " recipe" : " recipes");
                    setPage(i, { status: "done", message: reply.warnings.length > 0 ? count + ". " + reply.warnings.join(" ") : count });
                    playSound("tick");
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

    // Keep the pictures first (their addresses go on the recipes), then save the recipes
    async function save() {
        const ready: RecipeDraft[] = [];
        let photoProblem = "";
        const withPhotos = drafts.filter((d) => d.include && d.photoBlob).length;
        let done = 0;
        for (const d of drafts) {
            if (!d.include || !d.photoBlob) {
                ready.push(d);
                continue;
            }
            setSaving("Saving pictures " + (++done) + " of " + withPhotos + "…");
            const kept = await savePhoto(session.mode === "ready" ? barId : null, d.photoBlob);
            if ("url" in kept) ready.push({ ...d, photo: kept.url, photoBlob: null });
            else {
                photoProblem = kept.error;
                ready.push({ ...d, photo: "", photoBlob: null });
            }
        }
        const ids = saveRecipeDrafts(ready);
        setSaving("");
        setSaved(ids);
        setDrafts([]);
        setPages([]);
        setFiles([]);
        celebrate("big");
        toast(ids.length + (ids.length === 1 ? " recipe" : " recipes") + " added", { sub: photoProblem ? "Pictures weren't kept: " + photoProblem : "Your recipe book is going digital." });
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
                            return r && <li key={id}><Link to={"/recipes/" + id}>{r.name}</Link>{!recipesOnly && <span className="muted small"> {r.type}</span>}</li>;
                        })}
                    </ul>
                    {!recipesOnly && (
                        <p className="muted small">
                            New ingredients have no cost until they're linked to a product or a prep recipe.
                            Set them up on the <Link to="/ingredients">Ingredients</Link> page, and recipe costs fill in.
                        </p>
                    )}
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
                    Nothing is saved until you press Save. Pictures on the pages are cut out and kept with the recipes.
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
                    <button onClick={() => void save()} disabled={reading || chosen.length === 0 || saving !== ""}>{saving || "Save " + chosen.length + (chosen.length === 1 ? " recipe" : " recipes")}</button>
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

            {!recipesOnly && newNames.length > 0 && (
                <section className="card card-pad-all scan-fill">
                    <div>
                        <strong>{newNames.length} new {newNames.length === 1 ? "ingredient" : "ingredients"} will be added.</strong>
                        <span className="muted small"> {newNames.join(", ")}. Tap a line's pencil to pick one you already have.</span>
                    </div>
                </section>
            )}

            {drafts.map((d) => (
                <DraftCard key={d.key} draft={d} recipesOnly={recipesOnly} ingredientOptions={ingredientOptions}
                    onChange={(change) => setDraft(d.key, change)}
                    onLine={(i, change) => setLine(d.key, i, change)}
                    onRemoveLine={(i) => setDraft(d.key, { lines: d.lines.filter((_, j) => j !== i), open: null })}
                    onAddLine={() => setDraft(d.key, { lines: [...d.lines, blankLine()], open: d.lines.length })} />
            ))}

            {!reading && drafts.length === 0 && (
                <section className="card card-pad-all"><p className="muted">No recipes were found on these pages.</p></section>
            )}
        </div>
    );
}


// ===== One recipe, compact =====

// A line added by hand when the scan missed one
function blankLine(): RecipeDraftLine {
    return {
        scanned: { amount: null, unit: "", countWord: "", unitGuessed: false, name: "", note: "" },
        amount: null, unit: "", countWord: "", note: "", checkCount: false,
        ingredientId: null, newName: "", how: "new"
    };
}

interface DraftCardProps {
    draft: RecipeDraft;
    recipesOnly: boolean;
    ingredientOptions: Ingredient[];
    onChange: (change: Partial<RecipeDraft>) => void;
    onLine: (index: number, change: Partial<RecipeDraftLine>) => void;
    onRemoveLine: (index: number) => void;
    onAddLine: () => void;
}

// The recipe as it'll read: picture, name, serves, lines, directions
//     a pencil on the header opens the recipe's details; a pencil on a line opens that line
//     only one thing is open at a time (open: -1 = details, 0.. = a line, null = nothing)
function DraftCard({ draft: d, recipesOnly, ingredientOptions, onChange, onLine, onRemoveLine, onAddLine }: DraftCardProps) {
    const db = useDb();
    const detailsOpen = d.open === -1;
    const sub = [
        "Page " + d.page,
        !recipesOnly && d.type,
        d.yieldUnit === "serving" && d.yieldAmount > 1 && "Serves " + formatFraction(d.yieldAmount),
        d.type === "Prep" && "Makes " + formatFraction(d.yieldAmount) + " " + d.yieldUnit,
        !recipesOnly && d.menuPrice !== null && formatMoney(d.menuPrice),
        !recipesOnly && d.glass,
        !recipesOnly && d.garnish && "Garnish: " + d.garnish
    ].filter(Boolean).join(" · ");

    return (
        <section className={"card recipe-scan" + (d.include ? "" : " left-out")}>
            <div className="recipe-scan-head">
                <input type="checkbox" checked={d.include} onChange={(e) => onChange({ include: e.target.checked })} aria-label={"Save " + d.name} />
                {d.photo
                    ? <img className="recipe-scan-thumb" src={d.photo} alt={"Picture of " + d.name} />
                    : <span className="recipe-scan-thumb empty" aria-hidden="true" />}
                <div className="recipe-scan-title">
                    <strong>{d.name}</strong>
                    <span className="muted small">{sub}</span>
                </div>
                <button type="button" className="pencil" aria-label={"Edit " + d.name + " details"} aria-expanded={detailsOpen}
                    onClick={() => onChange({ open: detailsOpen ? null : -1 })}>✎</button>
            </div>

            {d.duplicateOf && (
                <p className="warn small recipe-scan-dup">
                    You already have <Link to={"/recipes/" + d.duplicateOf}>{findById(db.recipes, d.duplicateOf)?.name}</Link>.
                    {d.include ? " This one will be saved as \"" + d.name + " (scanned)\"." : " Tick it to save this one too."}
                </p>
            )}

            {detailsOpen && (
                <div className="line-editor">
                    <label><span className="small muted">Name</span>
                        <input value={d.name} onChange={(e) => onChange({ name: e.target.value })} /></label>
                    {!recipesOnly && (
                        <label><span className="small muted">Type</span>
                            <select value={d.type} onChange={(e) => onChange({ type: e.target.value as RecipeType })}>
                                {TYPES.map((t) => <option key={t}>{t}</option>)}
                            </select></label>
                    )}
                    {d.type === "Prep" ? (
                        <label><span className="small muted">Batch makes</span>
                            <span className="recipe-scan-yield">
                                <AmountInput value={d.yieldAmount} className="qty-input" ariaLabel="Batch size" onSave={(v) => v !== null && onChange({ yieldAmount: v })} />
                                <select value={d.yieldUnit} aria-label="Batch unit" onChange={(e) => onChange({ yieldUnit: e.target.value })}>
                                    {YIELD_UNITS.map((u) => <option key={u}>{u}</option>)}
                                </select>
                            </span></label>
                    ) : (
                        <label><span className="small muted">Serves</span>
                            <AmountInput value={d.yieldAmount} className="qty-input" ariaLabel="Serves" onSave={(v) => v !== null && v > 0 && onChange({ yieldAmount: v, yieldUnit: "serving" })} /></label>
                    )}
                    {!recipesOnly && (
                        <>
                            <label><span className="small muted">Glass</span>
                                <input value={d.glass} onChange={(e) => onChange({ glass: e.target.value })} /></label>
                            <label><span className="small muted">Garnish</span>
                                <input value={d.garnish} onChange={(e) => onChange({ garnish: e.target.value })} /></label>
                            <label><span className="small muted">Menu price</span>
                                <AmountInput value={d.menuPrice} money allowBlank placeholder="—" ariaLabel="Menu price" onSave={(menuPrice) => onChange({ menuPrice })} /></label>
                        </>
                    )}
                    <label className="line-editor-wide"><span className="small muted">Directions</span>
                        <textarea rows={4} value={d.directions} onChange={(e) => onChange({ directions: e.target.value })} /></label>
                    <div className="line-editor-actions line-editor-wide">
                        {d.photo && <button type="button" className="link-button" onClick={() => onChange({ photo: "", photoBlob: null })}>Don't keep the picture</button>}
                        <button type="button" onClick={() => onChange({ open: null })}>Done</button>
                    </div>
                </div>
            )}

            <ul className="recipe-scan-lines">
                {d.lines.map((line, i) => (
                    <DraftLine key={i} line={line} open={d.open === i} recipesOnly={recipesOnly} ingredientOptions={ingredientOptions}
                        onToggle={() => onChange({ open: d.open === i ? null : i })}
                        onChange={(change) => onLine(i, change)}
                        onRemove={() => onRemoveLine(i)} />
                ))}
            </ul>
            <button type="button" className="link-button small recipe-scan-add" onClick={onAddLine}>+ Add a line</button>

            {d.directions && <p className="recipe-scan-directions">{d.directions}</p>}
        </section>
    );
}

interface DraftLineProps {
    line: RecipeDraftLine;
    open: boolean;
    recipesOnly: boolean;
    ingredientOptions: Ingredient[];
    onToggle: () => void;
    onChange: (change: Partial<RecipeDraftLine>) => void;
    onRemove: () => void;
}

// One ingredient line: reads as written ("2 onions, chopped"), a pencil opens it
//     unit? -> opens the line; Done (or changing the amount or unit) clears the question
function DraftLine({ line, open, recipesOnly, ingredientOptions, onToggle, onChange, onRemove }: DraftLineProps) {
    const name = draftLineName(line);
    const tag = recipesOnly ? undefined : HOW_TAG[line.how];
    const counted = line.unit === "each";
    return (
        <li className={"recipe-scan-line" + (open ? " open" : "")}>
            <div className="recipe-scan-line-row">
                <span className="recipe-scan-line-text">{lineText(line, name || "(no name)")}</span>
                {line.checkCount && !open && (
                    <button type="button" className="tag warn-tag count-check" title="No unit was written. Tap to pick one, or keep it as a count."
                        onClick={onToggle}>unit?</button>
                )}
                {tag && <span className={tag.className} title={tag.title}>{tag.text}</span>}
                <button type="button" className="pencil" aria-label={"Edit " + (name || "line")} aria-expanded={open} onClick={onToggle}>✎</button>
            </div>
            {open && (
                <div className="line-editor">
                    <label><span className="small muted">Amount</span>
                        <AmountInput value={line.amount} allowBlank placeholder="—" className="qty-input" ariaLabel="Amount"
                            onSave={(amount) => onChange({ amount, unit: amount === null ? "" : line.unit || "each", checkCount: false })} /></label>
                    <label><span className="small muted">Unit</span>
                        <select value={line.unit} aria-label="Unit" onChange={(e) => onChange({ unit: e.target.value, checkCount: false })}>
                            <option value="">—</option>
                            {PURCHASE_UNITS.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                        </select></label>
                    {counted && (
                        <label><span className="small muted">Of what (optional)</span>
                            <input value={line.countWord} placeholder="clove, can, stick" onChange={(e) => onChange({ countWord: e.target.value.trim().toLowerCase(), checkCount: false })} /></label>
                    )}
                    {recipesOnly ? (
                        <label className="line-editor-wide"><span className="small muted">Ingredient</span>
                            <input value={line.newName} onChange={(e) => onChange({ newName: e.target.value, ingredientId: null, how: "new" })} /></label>
                    ) : (
                        <label className="line-editor-wide"><span className="small muted">Ingredient</span>
                            <select aria-label={"Ingredient for " + (line.scanned.name || "the line")} value={line.ingredientId ?? NEW}
                                onChange={(e) => onChange(e.target.value === NEW
                                    ? { ingredientId: null, how: "new" }
                                    : { ingredientId: e.target.value, how: "picked" })}>
                                <option value={NEW}>New: {line.newName || "…"}</option>
                                {ingredientOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                            {line.ingredientId === null && (
                                <input value={line.newName} aria-label="New ingredient name" placeholder="Name"
                                    onChange={(e) => onChange({ newName: e.target.value })} />
                            )}
                            {line.scanned.name && line.scanned.name.toLowerCase() !== name.toLowerCase() && <span className="muted small">written: {line.scanned.name}</span>}
                        </label>
                    )}
                    <label className="line-editor-wide"><span className="small muted">Note</span>
                        <input value={line.note} placeholder="chopped, to taste" onChange={(e) => onChange({ note: e.target.value })} /></label>
                    <div className="line-editor-actions line-editor-wide">
                        <button type="button" className="link-button danger-link" onClick={onRemove}>Remove line</button>
                        <button type="button" onClick={() => { onChange({ checkCount: false }); onToggle(); }}>Done</button>
                    </div>
                </div>
            )}
        </li>
    );
}
