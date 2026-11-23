// ===== setup.ts =====
// The setup ladder: where a new bar, kitchen or brewery is in getting set up,
// worked out from what's already in Agave (nothing extra is stored, so it's never wrong).
//
//     1. RECIPES   any recipe in Agave
//     2. TEAM      anyone besides you on the team           (needs an account)
//     3. COSTS     any price recorded (an invoice, or typed)
//     4. SALES     any sales report or POS sync
//     5. COUNT     a closed stock count
//
// The home screen shows ONE next step: the first that isn't done and wasn't put off
// with "Later". Put-off steps wait in a short "set up later" list.
// Tabs show up as their step is done, so a new place sees only Home and Recipes:
//     Stock     once there are products, prices or counts
//     Numbers   once there are sales or a closed count
// "Show everything" (profile menu) turns every tab on.

import { useSyncExternalStore } from "react";
import type { Database } from "./types";

export type StepId = "recipes" | "team" | "costs" | "sales" | "count";

export interface Step {
    id: StepId;
    done: boolean;
}

export const STEP_ORDER: StepId[] = ["recipes", "team", "costs", "sales", "count"];

// teamSize: people on the team (null = no accounts here, so the team step doesn't apply)
export function setupSteps(data: Database, teamSize: number | null): Step[] {
    const done: Record<StepId, boolean> = {
        recipes: data.recipes.length > 0,
        team: teamSize !== null && teamSize > 1,
        costs: data.priceEntries.length > 0,
        sales: data.salesImports.length > 0,
        count: data.stockCounts.some((c) => c.status === "closed")
    };
    // No accounts here (the demo): the team step doesn't apply
    return STEP_ORDER.filter((id) => id !== "team" || teamSize !== null).map((id) => ({ id, done: done[id] }));
}

// The step to show: the first not done and not put off (null = all set, or all put off)
export function nextStep(steps: Step[], later: StepId[]): Step | null {
    return steps.find((s) => !s.done && !later.includes(s.id)) ?? null;
}

export function unlockedTabs(data: Database, showAll: boolean) {
    return {
        stock: showAll || data.products.length > 0 || data.priceEntries.length > 0 || data.stockCounts.length > 0,
        numbers: showAll || data.salesImports.length > 0 || data.stockCounts.some((c) => c.status === "closed")
    };
}


// ===== "Later" and "Show everything" (this device, per place) =====

const listeners = new Set<() => void>();
let version = 0;

function read(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch { /* private mode: fine for this session */ }
    version++;
    for (const l of listeners) l();
}

function useVersion() {
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
}

export function laterSteps(placeId: string): StepId[] {
    try { return JSON.parse(read("agave.later." + placeId) ?? "[]") as StepId[]; } catch { return []; }
}

export function putOff(placeId: string, step: StepId) {
    write("agave.later." + placeId, JSON.stringify([...new Set([...laterSteps(placeId), step])]));
}

export function bringBack(placeId: string, step: StepId) {
    write("agave.later." + placeId, JSON.stringify(laterSteps(placeId).filter((s) => s !== step)));
}

export function showEverything(): boolean {
    return read("agave.showAll") === "1";
}

export function setShowEverything(on: boolean) {
    write("agave.showAll", on ? "1" : null);
}

export function useSetupPrefs(placeId: string) {
    useVersion();
    return { later: laterSteps(placeId), showAll: showEverything() };
}

// The last step count this device saw done, to celebrate a step the moment it's finished
export function lastDoneCount(placeId: string): number | null {
    const saved = read("agave.stepsDone." + placeId);
    return saved === null ? null : Number(saved);
}

export function saveDoneCount(placeId: string, count: number) {
    try { localStorage.setItem("agave.stepsDone." + placeId, String(count)); } catch { /* fine */ }
}
