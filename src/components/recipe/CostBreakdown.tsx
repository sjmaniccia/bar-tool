// ===== CostBreakdown.tsx =====
// Which ingredients the money goes to, as bars (easier to read on a phone
// than a pie chart). Longest bar = most expensive ingredient.

import type { RecipeLine } from "../../data/types";
import { db } from "../../data/storage";
import { findById, formatMoney, formatPercent } from "../../data/utils";
import { lineIngredientCost } from "../../data/costing";

export default function CostBreakdown({ lines }: { lines: RecipeLine[] }) {
    // Each line's name and cost, most expensive first (lines with no price are left out)
    const parts = lines
        .map((line) => ({
            id: line.id,
            name: findById(db.ingredients, line.ingredientId)?.name ?? findById(db.recipes, line.subRecipeId)?.name ?? "?",
            cost: lineIngredientCost(line) ?? 0
        }))
        .filter((part) => part.cost > 0)
        .sort((a, b) => b.cost - a.cost);
    const total = parts.reduce((sum, part) => sum + part.cost, 0);   // reduce = add them all up

    return (
        <section className="card">
            <h2>Cost breakdown</h2>
            {parts.length === 0 ? (
                <p className="muted">Costs appear here once ingredients have prices.</p>
            ) : (
                <ul className="bars">
                    {parts.map((part) => (
                        <li key={part.id}>
                            <div className="bar-label">
                                <span>{part.name}</span>
                                <span>{formatMoney(part.cost)} · {formatPercent(part.cost / total)}</span>
                            </div>
                            <div className="bar-track">
                                {/* The bar's width is this ingredient's share of the total */}
                                <div className="bar-fill" style={{ width: (part.cost / total * 100) + "%" }} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
