// ===== menus.ts =====
// Menus group recipes (the fall cocktail list, the brunch menu) so you can see
// the costs of a whole menu at once and print a spec book for staff.
// In a recipe book, a menu is a meal (Thanksgiving): anyone adds dishes; the one who made
// the menu (or the owner) renames, reorders, deletes it or takes dishes off. You can
// always take off a dish you added. (recipes-only.sql enforces it.)

import { db, commit } from "./storage";
import { summarize, type RecipeSummary } from "./costing";
import { findById, makeId } from "./utils";
import type { MenuItem, Recipe } from "./types";
import { me } from "./me";

export function createMenu(name: string): string {
    const id = makeId();
    db.menus.push({ id, name: name.trim() || "New menu", description: "", createdBy: me() });
    commit();
    return id;
}

export function updateMenu(menuId: string, changes: { name?: string; description?: string }) {
    const menu = findById(db.menus, menuId);
    if (menu === null) return;
    Object.assign(menu, changes);
    commit();
}

export function deleteMenu(menuId: string) {
    db.menus = db.menus.filter((m) => m.id !== menuId);
    db.menuItems = db.menuItems.filter((i) => i.menuId !== menuId);
    commit();
}

// A menu's items in order
export function itemsOf(menuId: string): MenuItem[] {
    return db.menuItems.filter((i) => i.menuId === menuId).sort((a, b) => a.sortOrder - b.sortOrder);
}

// Add a recipe to the end of a menu (once)
export function addToMenu(menuId: string, recipeId: string) {
    const items = itemsOf(menuId);
    if (items.some((i) => i.recipeId === recipeId)) return;
    const last = items.length === 0 ? 0 : items[items.length - 1].sortOrder;
    db.menuItems.push({ id: makeId(), menuId, recipeId, sortOrder: last + 1, createdBy: me() });
    commit();
}

export function removeFromMenu(itemId: string) {
    db.menuItems = db.menuItems.filter((i) => i.id !== itemId);
    commit();
}

// Move an item up (-1) or down (+1) by swapping with its neighbour
export function moveItem(itemId: string, direction: -1 | 1) {
    const item = findById(db.menuItems, itemId);
    if (item === null) return;
    const items = itemsOf(item.menuId);
    const index = items.indexOf(item);
    const other = items[index + direction];
    if (other === undefined) return;
    [item.sortOrder, other.sortOrder] = [other.sortOrder, item.sortOrder];
    commit();
}

// Recipes on a menu with their summaries (null summary = the recipe has a loop)
export function menuRows(menuId: string): { item: MenuItem; recipe: Recipe; summary: RecipeSummary | null }[] {
    const rows = [];
    for (const item of itemsOf(menuId)) {
        const recipe = findById(db.recipes, item.recipeId);
        if (recipe === null) continue;
        let summary: RecipeSummary | null = null;
        try {
            summary = summarize(recipe);
        } catch {
            summary = null;
        }
        rows.push({ item, recipe, summary });
    }
    return rows;
}

export interface MenuStats {
    priced: number;              // items with a menu price
    averageCostRatio: number | null;   // average total cost % across priced items
    averageProfit: number | null;
}

// Averages across the items that have a menu price
export function menuStats(menuId: string): MenuStats {
    let priced = 0;
    let ratioSum = 0;
    let profitSum = 0;
    for (const { summary } of menuRows(menuId)) {
        if (summary === null || summary.totalRatio === null || summary.profit === null) continue;
        priced++;
        ratioSum += summary.totalRatio;
        profitSum += summary.profit;
    }
    return {
        priced,
        averageCostRatio: priced === 0 ? null : ratioSum / priced,
        averageProfit: priced === 0 ? null : profitSum / priced
    };
}
