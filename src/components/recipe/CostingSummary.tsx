// ===== CostingSummary.tsx =====
// The row of cost cards on a recipe page:
//     Menu price | Ingredient cost | Labor cost | Total cost | Profit | Suggested price
// Each cost also shows what % of the menu price it takes.

import type { Recipe } from "../../data/types";
import type { RecipeSummary } from "../../data/costing";
import { updateRecipe } from "../../data/actions";
import { formatMoney, formatPercent } from "../../data/utils";
import AmountInput from "../AmountInput";

interface Props {
    recipe: Recipe;
    summary: RecipeSummary;
}

// One small card: a label, a big number, and an optional % of menu price
function Stat({ label, value, ratio, warn = false, note }: { label: string; value: string; ratio?: number | null; warn?: boolean; note?: string }) {
    return (
        <div className={"stat" + (warn ? " warn" : "")}>
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
            {ratio != null && <span className="stat-ratio">{formatPercent(ratio)} of price</span>}
            {note && <span className="stat-ratio">{note}</span>}
        </div>
    );
}

export default function CostingSummary({ recipe, summary }: Props) {
    const per = summary.perServing ? "" : " /" + recipe.yieldUnit;
    // Red when ingredient cost is more than 5 points over the target for this type
    const overTarget = summary.ingredientRatio !== null && summary.ingredientRatio > summary.targetCost + 0.05;

    return (
        <section className="card">
            <h2>Costing summary {!summary.perServing && <span className="muted small">(per {recipe.yieldUnit})</span>}</h2>
            <div className="stat-row">
                {/* The menu price is typed right here; it saves when you leave the box */}
                <div className="stat price">
                    <span className="stat-label">Menu price</span>
                    {summary.perServing ? (
                        <AmountInput
                            value={recipe.menuPrice}
                            money
                            allowBlank
                            placeholder="Not sold"
                            className="stat-input"
                            ariaLabel="Menu price"
                            onSave={(value) => updateRecipe(recipe.id, { menuPrice: value })}
                        />
                    ) : (
                        <span className="stat-ratio">Needs a yield in servings</span>
                    )}
                </div>
                <Stat label="Ingredient cost" value={formatMoney(summary.ingredientCost) + per} ratio={summary.ingredientRatio} warn={overTarget} />
                <Stat label="Labor cost" value={formatMoney(summary.laborCost) + per} ratio={summary.laborRatio} />
                <Stat label="Total cost" value={formatMoney(summary.totalCost) + per} ratio={summary.totalRatio} />
                <Stat
                    label="Profit"
                    value={summary.profit === null ? "—" : formatMoney(summary.profit)}
                    ratio={summary.profit === null || summary.menuPrice === null ? null : summary.profit / summary.menuPrice}
                    warn={summary.profit !== null && summary.profit < 0}
                />
                <Stat
                    label="Suggested price"
                    value={summary.perServing ? formatMoney(summary.suggestedPrice) : "—"}
                    note={"at " + formatPercent(summary.targetCost) + " ingredient cost"}
                />
            </div>
        </section>
    );
}
