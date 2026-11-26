// ===== familyRules.ts =====
// In a "Just recipes" place, family (managers) change only the recipes they added.
// The database refuses anything else (supabase/recipes-only.sql); this is the same rule
// on the device, so a refused change is undone right away instead of blocking every
// other change from being sent. The app's screens hide those edits anyway.
//
//     RECIPES       mine before and after (createdBy = me), or a new one that's mine
//     RECIPE LINES  the recipe they belong to is mine, or it's gone
//     INGREDIENTS   new ones are fine; no renaming or removing
//     MENUS         mine before and after, like recipes
//     MENU ITEMS    adding is fine (as mine); taking off: mine, or my menu; moving: my menu
//     SETTINGS      the owner's (placeSettings)

import type { Database } from "../data/types";
import { recordKey, type Change, type Snapshot } from "./records";

type Row = Record<string, unknown>;

export function familyBlocked(changes: Change[], data: Database, base: Snapshot, me: string): Change[] {
    const before = (kind: string, id: string): Row | null => {
        const json = base.get(recordKey(kind, id));
        return json === undefined ? null : JSON.parse(json) as Row;
    };
    // Whose recipe is it now? (in this batch, or on the server) null = gone
    const ownerOf = (recipeId: unknown): string | null => {
        const now = data.recipes.find((r) => r.id === recipeId);
        if (now) return now.createdBy;
        return null;
    };
    const menuMineOrGone = (menuId: unknown) => {
        const old = before("menus", String(menuId));
        if (old !== null) return old.createdBy === me;
        const now = data.menus.find((m) => m.id === menuId);
        return !now || now.createdBy === me;
    };
    const mineOrGone = (recipeId: unknown) => {
        const owner = ownerOf(recipeId);
        const old = before("recipes", String(recipeId));
        // Judge by what the server knows: an existing recipe keeps its server owner
        if (old !== null) return old.createdBy === me;
        return owner === null || owner === me;
    };

    return changes.filter((change) => {
        const old = before(change.kind, change.id);
        const now = change.data;
        switch (change.kind) {
            case "placeSettings":
                return true;
            case "recipes":
                return (old !== null && old.createdBy !== me) || (now !== null && now.createdBy !== me);
            case "recipeLines":
                return (old !== null && !mineOrGone(old.recipeId)) || (now !== null && !mineOrGone(now.recipeId));
            case "menus":
                return (old !== null && old.createdBy !== me) || (now !== null && now.createdBy !== me);
            case "menuItems":
                if (old === null) return now !== null && now.createdBy !== me;
                if (now === null) return old.createdBy !== me && !menuMineOrGone(old.menuId);
                return !menuMineOrGone(old.menuId) || !menuMineOrGone(now.menuId) || now.createdBy !== old.createdBy;
            case "ingredients":
                return old !== null && (now === null || now.name !== old.name);
            default:
                return false;
        }
    });
}
