// ===== place.ts =====
// How a place uses Agave. Kept with the place's data, so everyone in it sees the same.
//     recipesOnly  a family's or home cook's recipes: costing, stock, sales and
//                  invoices are hidden everywhere. Nothing is deleted when it's on,
//                  so turning costing back on later picks up where it left off.

import { commit, db, useDb } from "./storage";
import type { Database } from "./types";

const ROW_ID = "place";

export function isRecipesOnly(data: Database = db): boolean {
    return data.placeSettings.find((s) => s.id === ROW_ID)?.recipesOnly === true;
}

export function setRecipesOnly(on: boolean) {
    const row = db.placeSettings.find((s) => s.id === ROW_ID);
    if (row) row.recipesOnly = on;
    else db.placeSettings.push({ id: ROW_ID, recipesOnly: on });
    commit();
}

// For screens: re-renders when the setting changes
export function useRecipesOnly(): boolean {
    return isRecipesOnly(useDb());
}
