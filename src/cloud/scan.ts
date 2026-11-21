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
export function limitReached(usage: ScanUsage | null): string | null {
    if (!usage) return null;
    if (usage.month >= usage.monthlyLimit) return "This bar has used its " + usage.monthlyLimit + " scans for this month. They reset on the 1st.";
    if (usage.today >= usage.dailyLimit) return "This bar has used its " + usage.dailyLimit + " scans for today. Type this invoice in, or scan it tomorrow.";
    return null;
}

// How many scans the bar has used (null if scanning.sql hasn't been run yet)
export async function scanUsage(barId: string): Promise<ScanUsage | null> {
    const { data, error } = await supabase!.rpc("scan_usage", { target_bar: barId });
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
    const { data, error } = await supabase!.functions.invoke("scan-invoice", { body: { barId, images: pages } });
    if (!error) {
        const reply = data as { invoice: ScannedInvoice; warnings: string[]; usage?: UsageRow };
        return { ok: true, invoice: reply.invoice, warnings: reply.warnings ?? [], usage: toUsage(reply.usage) };
    }
    try {
        const detail = await (error as { context?: Response }).context?.json();
        if (detail?.error) return { ok: false, error: detail.error, usage: toUsage(detail.usage) };
    } catch { /* not a JSON error body */ }
    return { ok: false, error: "Couldn't reach the scanner. Is the scan-invoice function deployed? (" + error.message + ")", usage: null };
}
