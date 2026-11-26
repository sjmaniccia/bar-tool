// ===== RecipeDetail.tsx =====
// One recipe, laid out as:
//     header: picture (add/change), name, and Edit details / Duplicate / Print / Delete
//     yield and labor | training details | cost breakdown
//     costing summary (menu price, ingredient, labor, total, profit, suggested)
//     ingredients table (edit in place, add at the bottom)
// A "Just recipes" place: picture, name, serves, the ingredient lines (pencil to edit),
// notes and directions. No costs, yield/labor or training.

import type { Recipe, RecipeLine } from "../data/types";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useDb } from "../data/storage";
import { findById, formatFraction, formatMoney } from "../data/utils";
import { linesFor, summarize, type RecipeSummary } from "../data/costing";
import { deleteRecipe, duplicateRecipe, linesUsingRecipe, makeMyVersion, updateRecipe } from "../data/actions";
import EditDetails from "../components/recipe/EditDetails";
import CostingSummary from "../components/recipe/CostingSummary";
import CostBreakdown from "../components/recipe/CostBreakdown";
import IngredientsTable from "../components/recipe/IngredientsTable";
import AmountInput from "../components/AmountInput";
import RecipePhoto from "../components/recipe/RecipePhoto";
import RecipeLines from "../components/recipe/RecipeLines";
import RecipeTitle from "../components/recipe/RecipeTitle";
import PencilIcon from "../components/PencilIcon";
import { useRecipesOnly } from "../data/place";
import { useMyName, useRecipeRights } from "../cloud/names";
import { nameOf } from "../cloud/team";
import { useSession } from "../cloud/session";
import { toast } from "../feedback";

export default function RecipeDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { recipeId } = useParams();                       // from the address: #/recipes/<recipeId>
    const [searchParams, setSearchParams] = useSearchParams();
    const editing = searchParams.get("edit") === "1";       // #/recipes/<id>?edit=1 opens the form
    const recipesOnly = useRecipesOnly();

    const recipe = findById(db.recipes, recipeId ?? null);
    if (recipe === null) {
        return (
            <div className="page">
                <h1>Recipe not found</h1>
                <Link to="/recipes">← All Recipes</Link>
            </div>
        );
    }

    // The costs. A loop should be impossible, but show a message instead of crashing if one sneaks in.
    let summary: RecipeSummary | null = null;
    try {
        summary = summarize(recipe);
    } catch {
        summary = null;
    }
    const lines = linesFor(recipe.id);
    const makes = findById(db.ingredients, recipe.producesIngredientId);
    const usedBy = db.recipes.filter((r) => linesFor(r.id).some((l) => l.subRecipeId === recipe.id || l.ingredientId === recipe.producesIngredientId && recipe.producesIngredientId !== null));

    function setEditing(on: boolean) {
        setSearchParams(on ? { edit: "1" } : {});
    }

    function duplicate() {
        const copyId = duplicateRecipe(recipe!.id);
        if (copyId) navigate("/recipes/" + copyId);
    }

    // Delete
    //     IF another recipe uses this one, say so and stop
    //     ELSE ask, delete, and go back to the list
    function remove() {
        if (linesUsingRecipe(recipe!.id) > 0) {
            alert("Another recipe uses " + recipe!.name + ". Remove it there first.");
            return;
        }
        // IF other recipes get an ingredient from this one, warn that they'll switch sources
        const warning = usedBy.length > 0 && makes
            ? "\n\n" + usedBy.map((r) => r.name).join(", ") + " will switch to another source for " + makes.name + "."
            : "";
        if (confirm("Delete " + recipe!.name + "?" + warning) && deleteRecipe(recipe!.id)) {
            navigate("/recipes");
        }
    }

    if (recipesOnly) {
        return <FamilyRecipe recipe={recipe} lines={lines} remove={remove} />;
    }

    return (
        <div className="page recipe-page">
            <Link to="/recipes" className="back no-print">← All Recipes</Link>

            <div className="page-header">
                <div className="recipe-title">
                    <RecipePhoto recipe={recipe} />
                    <div>
                    <RecipeTitle recipe={recipe} />
                    <div className="tags">
                        <span className="tag">{recipe.type}</span>
                        {makes && <span className="tag house">makes {makes.name}</span>}
                        {usedBy.length > 0 && <span className="tag">used in {usedBy.map((r) => r.name).join(", ")}</span>}
                    </div>
                    </div>
                </div>
                <div className="button-row no-print">
                    <button className="secondary" onClick={() => setEditing(true)}>Edit details</button>
                    <button className="secondary" onClick={duplicate}>Duplicate</button>
                    <button className="secondary" onClick={() => window.print()}>Print</button>
                    <button className="danger" onClick={remove}>Delete</button>
                </div>
            </div>

            {editing && <EditDetails recipe={recipe} onDone={() => setEditing(false)} />}

            {/* Warnings first, so nothing below is misread */}
            {summary === null && (
                <section className="card warn-box">This recipe uses itself somewhere, so it can't be costed. Check its sub-recipes.</section>
            )}
            {summary !== null && summary.missing.length > 0 && (
                <section className="card warn-box">
                    No price yet for <strong>{summary.missing.join(", ")}</strong>. Costs below leave {summary.missing.length === 1 ? "it" : "them"} out
                    until a product is added on <Link to="/products">Products</Link>.
                </section>
            )}

            {/* The build comes first: it's what people open a recipe to see */}
            <IngredientsTable recipe={recipe} lines={lines} />

            {summary !== null && (
                <>
                    <CostingSummary recipe={recipe} summary={summary} />

                    <div className="card-grid">
                        {/* Training details for staff */}
                        <section className="card">
                            <h2>Training</h2>
                            <div className="field"><span className="field-label">Glass</span><span className="field-value">{recipe.glass || "—"}</span></div>
                            <div className="field"><span className="field-label">Garnish</span><span className="field-value">{recipe.garnish || "—"}</span></div>
                            {recipe.description && <p>{recipe.description}</p>}
                            {recipe.directions ? <p className="directions">{recipe.directions}</p>
                                : <p className="muted small">No directions yet. Add them with Edit details.</p>}
                        </section>

                        <CostBreakdown lines={lines} />

                        {/* Yield and labor: labor = wage × minutes, per batch */}
                        <section className="card">
                            <h2>Yield &amp; labor</h2>
                            <div className="field">
                                <span className="field-label">Makes</span>
                                <span className="field-value">{formatFraction(recipe.yieldAmount)} {recipe.yieldUnit}</span>
                            </div>
                            <label className="field">
                                <span className="field-label">Labor wage ($/hr)</span>
                                <AmountInput value={recipe.laborWage} money allowBlank placeholder="20.00"
                                    onSave={(v) => updateRecipe(recipe.id, { laborWage: v })} />
                            </label>
                            <label className="field">
                                <span className="field-label">Labor time (minutes per batch)</span>
                                <AmountInput value={recipe.laborMinutes} allowBlank placeholder="1"
                                    onSave={(v) => updateRecipe(recipe.id, { laborMinutes: v })} />
                            </label>
                            <p className="muted small">
                                Labor per batch {formatMoney(summary.batchLaborCost)}, including in-house preps.
                            </p>
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}


// ===== Just recipes =====
// Reads like a recipe card, and every part is edited where it sits:
//     picture (camera)  name (the title)  "Serves 8" (tap it)        🖨 (print, top right)
//     Ingredients  ✎ per line
//     Directions   ✎
//     Notes        ✎ (where it's from, tips)
//     🗑 Delete recipe (at the very bottom)
// Someone else's recipe: the same page with nothing to edit; at the bottom,
// "Make my version" (a copy that's mine).
interface FamilyProps {
    recipe: Recipe;
    lines: RecipeLine[];
    remove: () => void;
}

const PRINT_ICON = "M7 9V4h10v5 M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2 M7 14h10v6H7z";
const TRASH_ICON = "M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3";

function Icon({ d, size = 20 }: { d: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={d} />
        </svg>
    );
}

function FamilyRecipe({ recipe, lines, remove }: FamilyProps) {
    const navigate = useNavigate();
    const session = useSession();
    const { canEdit, addedBy } = useRecipeRights(recipe);
    const myName = useMyName() || nameOf({ name: "", email: session.email });

    function myVersion() {
        const id = makeMyVersion(recipe.id, myName);
        if (id) {
            toast("Your version is ready", { sub: "Change it however you like.", sound: "tick" });
            navigate("/recipes/" + id);
        }
    }

    return (
        <div className="page recipe-page family-recipe">
            <div className="family-top no-print">
                <Link to="/recipes" className="back">← All recipes</Link>
                <button className="icon-button plain" aria-label="Print" title="Print" onClick={() => window.print()}><Icon d={PRINT_ICON} /></button>
            </div>
            {/* With a picture: the picture big and centered, the name under it */}
            <div className={"recipe-title" + (recipe.photo ? " with-picture" : "")}>
                <RecipePhoto recipe={recipe} readOnly={!canEdit} />
                <div>
                    <RecipeTitle recipe={recipe} readOnly={!canEdit} />
                    <p className="muted family-sub">
                        <Serves recipe={recipe} canEdit={canEdit} />
                        {addedBy && <span>Added by {addedBy}</span>}
                    </p>
                </div>
            </div>

            <RecipeLines recipe={recipe} lines={lines} readOnly={!canEdit} />
            <EditableCard title="Directions" value={recipe.directions} canEdit={canEdit} rows={8}
                empty="+ Add directions" placeholder="Heat the oven to 350. Melt the butter…"
                onSave={(directions) => updateRecipe(recipe.id, { directions })} className="directions" />
            {(recipe.description || canEdit) && (
                <EditableCard title="Notes" value={recipe.description} canEdit={canEdit} rows={3}
                    empty="+ Add a note: where it's from, tips" placeholder="Grandma's, from the church cookbook. Double it for Thanksgiving."
                    onSave={(description) => updateRecipe(recipe.id, { description })} />
            )}

            {canEdit ? (
                <button className="link-button danger-link family-delete no-print" onClick={remove}>
                    <Icon d={TRASH_ICON} size={16} /> Delete recipe
                </button>
            ) : (
                <div className="recipe-bottom-actions no-print">
                    <p className="muted small">
                        {addedBy ? "This is " + addedBy + "'s recipe" : "Someone else added this recipe"}, so you can't change it.
                        Want it your way? Make your own version.
                    </p>
                    <div className="button-row">
                        <button onClick={myVersion}>Make my version</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// "Serves 8": tap to change it (a number box), Enter or tap away to save
function Serves({ recipe, canEdit }: { recipe: Recipe; canEdit: boolean }) {
    const [editing, setEditing] = useState(false);
    const shown = recipe.yieldUnit === "serving" && recipe.yieldAmount > 1 ? "Serves " + formatFraction(recipe.yieldAmount) : "";
    if (!canEdit) return shown ? <span>{shown}</span> : null;
    if (editing) {
        return (
            <span className="serves-edit">Serves{" "}
                <AmountInput value={recipe.yieldUnit === "serving" ? recipe.yieldAmount : null} allowBlank className="qty-input" ariaLabel="Serves" autoFocus
                    onSave={(v) => { if (v !== null && v > 0) updateRecipe(recipe.id, { yieldAmount: v, yieldUnit: "serving" }); setEditing(false); }} />
            </span>
        );
    }
    return (
        <button className="link-button serves-button" onClick={() => setEditing(true)}>
            {shown || "+ How many it serves"}
        </button>
    );
}

// A card of text (directions, notes) with a pencil: tap it to edit in place, Done to save
function EditableCard({ title, value, canEdit, empty, placeholder, rows, onSave, className = "" }: {
    title: string; value: string; canEdit: boolean; empty: string; placeholder: string; rows: number;
    onSave: (value: string) => void; className?: string;
}) {
    const [text, setText] = useState<string | null>(null);     // null = not editing
    const editing = text !== null;
    function done() {
        if (text !== null && text.trim() !== value) onSave(text.trim());
        setText(null);
    }
    return (
        <section className="card editable-card">
            <div className="editable-head">
                <h2>{title}</h2>
                {canEdit && !editing && value && (
                    <button className="pencil no-print" aria-label={"Edit " + title.toLowerCase()} onClick={() => setText(value)}><PencilIcon /></button>
                )}
            </div>
            {editing ? (
                <div className="editable-body">
                    <textarea rows={rows} value={text} placeholder={placeholder} autoFocus aria-label={title} onChange={(e) => setText(e.target.value)} />
                    <div className="button-row">
                        <button onClick={done}>Done</button>
                        <button className="link-button" onClick={() => setText(null)}>Cancel</button>
                    </div>
                </div>
            ) : value ? (
                <p className={className}>{value}</p>
            ) : canEdit ? (
                <button className="link-button small no-print" onClick={() => setText("")}>{empty}</button>
            ) : null}
        </section>
    );
}
