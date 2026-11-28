// ===== scan.ts =====
// The app's side of invoice scanning. The photos go to the server function
// (supabase/functions/scan-invoice), which holds the Anthropic key and asks Claude
// to read them. The app never sees the key.
//
//     FOR each photo:
//         shrink it to at most 1568 px on the long side, as a JPEG
//             (phone photos are 4000+ px; that is plenty to read print and ~10x smaller)
//     send them all at once (one invoice can be several pages)
//     RETURN the cleaned-up invoice, or a message saying what went wrong
//
// Each bar gets a number of scans a day and a month (supabase/scanning.sql). The server
// enforces them; the app only shows them, so a manager knows before taking photos.

import { supabase } from "./client";
import type { ScannedInvoice } from "../data/invoiceScan";
import type { ScannedRecipe } from "../data/recipeScan";

export type ScanKind = "invoice" | "recipe";
export const MAX_RECIPE_PAGES = 30;     // photos chosen at once (each is read on its own)

export const MAX_PAGES = 4;
const MAX_SIDE = 1568;            // Claude shrinks anything bigger to this anyway

export interface ScanPage {
    mediaType: "image/jpeg";
    data: string;               // base64, without the "data:image/jpeg;base64," part
}

export interface ScanUsage {
    today: number;
    month: number;
    dailyLimit: number;
    monthlyLimit: number;
}

export type ScanReply =
    | { ok: true; invoice: ScannedInvoice; warnings: string[]; usage: ScanUsage | null }
    | { ok: false; error: string; usage: ScanUsage | null };

interface UsageRow {
    today_count: number;
    month_count: number;
    daily_limit: number;
    monthly_limit: number;
}

function toUsage(row: UsageRow | undefined): ScanUsage | null {
    return row ? { today: row.today_count, month: row.month_count, dailyLimit: row.daily_limit, monthlyLimit: row.monthly_limit } : null;
}

// Is the bar at a limit? -> the message to show, or null
export function limitReached(usage: ScanUsage | null, kind: ScanKind = "invoice"): string | null {
    if (!usage) return null;
    const noun = kind === "invoice" ? "scans" : "recipe pages";
    if (usage.month >= usage.monthlyLimit) return "This bar has used its " + usage.monthlyLimit + " " + noun + " for this month. They reset on the 1st.";
    if (usage.today >= usage.dailyLimit) return "This bar has used its " + usage.dailyLimit + " " + noun + " for today. Try again tomorrow.";
    return null;
}

// How many scans the bar has used (null if the limits SQL hasn't been run yet)
export async function scanUsage(barId: string, kind: ScanKind = "invoice"): Promise<ScanUsage | null> {
    const args: Record<string, string> = { target_bar: barId };
    if (kind !== "invoice") args.scan_kind = kind;
    const { data, error } = await supabase!.rpc("scan_usage", args);
    if (error) return null;
    return toUsage((data as UsageRow[])[0]);
}

// Photo file -> smaller JPEG, as base64
export async function shrinkPhoto(file: File): Promise<ScanPage> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";             // see-through PNGs would turn black as JPEG
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const url = canvas.toDataURL("image/jpeg", 0.85);
    return { mediaType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) };
}

export async function scanInvoice(barId: string, pages: ScanPage[]): Promise<ScanReply> {
    const reply = await callScanner<{ invoice: ScannedInvoice }>("scan-invoice", barId, pages);
    return reply.ok ? { ok: true, invoice: reply.data.invoice, warnings: reply.warnings, usage: reply.usage } : reply;
}

// One line read off a paper waste log (supabase/functions/_shared/waste-scan.ts)
export interface ScannedWaste {
    date: string;
    item: string;
    quantity: number;
    unit: string;
    reason: "spill" | "comp" | "returned" | "breakage" | "expired" | "other";
    note: string;
}

export type WasteReply =
    | { ok: true; lines: ScannedWaste[]; warnings: string[]; usage: ScanUsage | null }
    | { ok: false; error: string; usage: ScanUsage | null };

// The photos of a waste log -> its lines (counts against the invoice scans)
export async function scanWaste(barId: string, pages: ScanPage[]): Promise<WasteReply> {
    const reply = await callScanner<{ lines: ScannedWaste[] }>("scan-waste", barId, pages);
    return reply.ok ? { ok: true, lines: reply.data.lines, warnings: reply.warnings, usage: reply.usage } : reply;
}

export type RecipeReply =
    | { ok: true; recipes: ScannedRecipe[]; warnings: string[]; usage: ScanUsage | null }
    | { ok: false; error: string; usage: ScanUsage | null };

// One recipe book page -> the recipes on it
export async function scanRecipePage(barId: string, page: ScanPage): Promise<RecipeReply> {
    const reply = await callScanner<{ recipes: ScannedRecipe[] }>("scan-recipes", barId, [page]);
    return reply.ok ? { ok: true, recipes: reply.data.recipes, warnings: reply.warnings, usage: reply.usage } : reply;
}

// Call a scanning function -> its answer, or a message saying what went wrong
async function callScanner<T>(name: string, barId: string, pages: ScanPage[])
    : Promise<{ ok: true; data: T; warnings: string[]; usage: ScanUsage | null } | { ok: false; error: string; usage: ScanUsage | null }> {
    const { data, error } = await supabase!.functions.invoke(name, { body: { barId, images: pages } });
    if (!error) {
        const reply = data as T & { warnings?: string[]; usage?: UsageRow };
        return { ok: true, data: reply, warnings: reply.warnings ?? [], usage: toUsage(reply.usage) };
    }
    try {
        const detail = await (error as { context?: Response }).context?.json();
        if (detail?.error) return { ok: false, error: detail.error, usage: toUsage(detail.usage) };
    } catch { /* not a JSON error body */ }
    return { ok: false, error: "Couldn't reach the scanner. Is the " + name + " function deployed? (" + error.message + ")", usage: null };
}
