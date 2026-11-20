// ===== alerts.ts =====
// Things a manager should hear about without going looking:
//     recipes whose ingredient cost is over the target for their type
//     recipes whose cost moved when an invoice changed a price
//     products coming up short on the latest variance report

import { db } from "./storage";
import { summarize } from "./costing";
import { closedCounts, varianceReport } from "./variance";
import type { Recipe } from "./types";

// How far over target counts as "over" (the same 5 points the recipe page uses)
const MARGIN = 0.05;

// Recipes with a menu price whose ingredient cost % is over target
export function recipesOverTarget(): Recipe[] {
    return db.recipes.filter((recipe) => {
        if (recipe.menuPrice === null) return false;
        try {
            const s = summarize(recipe);
            return s.ingredientRatio !== null && s.ingredientRatio > s.targetCost + MARGIN;
        } catch {
            return false;
        }
    });
}

// Every recipe's ingredient cost right now (to compare after a price change)
export function snapshotCosts(): Map<string, number> {
    const costs = new Map<string, number>();
    for (const recipe of db.recipes) {
        try {
            costs.set(recipe.id, summarize(recipe).ingredientCost);
        } catch {
            // a recipe that loops has no cost to compare
        }
    }
    return costs;
}

export interface CostChange {
    recipe: Recipe;
    before: number;
    after: number;
    ratio: number | null;     // ingredient cost % of menu price, after
    overTarget: boolean;
}

// What moved since a snapshot, biggest change first (preps are left out: their drinks show the effect)
export function costChanges(before: Map<string, number>): CostChange[] {
    const changes: CostChange[] = [];
    for (const recipe of db.recipes) {
        if (recipe.type === "Prep") continue;
        const was = before.get(recipe.id);
        if (was === undefined) continue;
        try {
            const s = summarize(recipe);
            if (Math.abs(s.ingredientCost - was) < 0.005) continue;
            changes.push({
                recipe, before: was, after: s.ingredientCost, ratio: s.ingredientRatio,
                overTarget: s.ingredientRatio !== null && s.ingredientRatio > s.targetCost + MARGIN
            });
        } catch {
            continue;
        }
    }
    return changes.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
}

export interface ShortProduct {
    formatId: string;
    missing: number;     // units
    dollars: number;
    share: number;       // missing ÷ used
}

export interface Shortages {
    products: ShortProduct[];
    unmatched: number;   // POS items not matched yet (shortages are held back until they are)
}

// Products more than 5% (and $5) short between the last two finished counts
//     IF there's no sales report for the period, nothing to compare
//     IF some POS items aren't matched yet, don't flag products: an unmatched
//         lager would look 100% "missing", which would send someone on a false alarm
export function latestShortages(): Shortages {
    const none: Shortages = { products: [], unmatched: 0 };
    const counts = closedCounts();
    if (counts.length < 2) return none;
    const report = varianceReport(counts.at(-2)!.id, counts.at(-1)!.id);
    if (report === null || report.salesReports === 0) return none;
    if (report.unmatchedSales > 0) return { products: [], unmatched: report.unmatchedSales };
    const short: ShortProduct[] = [];
    for (const row of report.rows) {
        if (row.unitCost === null || row.actual <= 0) continue;
        const dollars = row.variance * row.unitCost;
        const share = row.variance / row.actual;
        if (dollars > 5 && share > 0.05) short.push({ formatId: row.formatId, missing: row.variance, dollars, share });
    }
    return { products: short, unmatched: 0 };
}
