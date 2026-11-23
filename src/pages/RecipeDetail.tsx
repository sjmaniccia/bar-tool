// ===== RecipeDetail.tsx =====
// One recipe, laid out as:
//     header: picture (add/change), name, and Edit details / Duplicate / Print / Delete
//     yield and labor | training details | cost breakdown
//     costing summary (menu price, ingredient, labor, total, profit, suggested)
//     ingredients table (edit in place, add at the bottom)

import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useDb } from "../data/storage";
import { findById, formatFraction, formatMoney } from "../data/utils";
import { linesFor, summarize, type RecipeSummary } from "../data/costing";
import { deleteRecipe, duplicateRecipe, linesUsingRecipe, updateRecipe } from "../data/actions";
import EditDetails from "../components/recipe/EditDetails";
import CostingSummary from "../components/recipe/CostingSummary";
import CostBreakdown from "../components/recipe/CostBreakdown";
import IngredientsTable from "../components/recipe/IngredientsTable";
import AmountInput from "../components/AmountInput";
import RecipePhoto from "../components/recipe/RecipePhoto";

export default function RecipeDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { recipeId } = useParams();                       // from the address: #/recipes/<recipeId>
    const [searchParams, setSearchParams] = useSearchParams();
    const editing = searchParams.get("edit") === "1";       // #/recipes/<id>?edit=1 opens the form

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

    return (
        <div className="page recipe-page">
            <Link to="/recipes" className="back no-print">← All Recipes</Link>

            <div className="page-header">
                <div className="recipe-title">
                    <RecipePhoto recipe={recipe} />
                    <div>
                    <h1>{recipe.name}</h1>
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
