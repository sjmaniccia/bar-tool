// ===== pos.ts =====
// The app's side of the Square connection. The keys live on the server; this file
// only asks the server function (supabase/functions/square) to connect, sync or disconnect.
//
//     SYNC   fetch from the day after the newest FINISHED Square day through today,
//            the first time the last 14 days. Each day becomes its own sales import
//            ("Square 2026-11-20"), so the Variance report can place each day between
//            the right two counts.
//            A day imported while it was still going (today) isn't finished, so the
//            next sync fetches it again and replaces it with the full day.

import { isNative, WEB_ADDRESS } from "../native";
import { supabase } from "./client";
import { db } from "../data/storage";
import { deleteSalesImport, importSales } from "../data/variance";
import { today } from "../data/utils";

export interface PosStatus {
    provider: string;
    merchantName: string;
    connectedAt: string;
    lastSyncedAt: string | null;
    lastError: string | null;
}

const PREFIX = "Square ";
const FIRST_SYNC_DAYS = 14;
const MAX_DAYS_PER_SYNC = 31;

// Is Square connected for this bar? (null = not connected)
export async function squareStatus(barId: string): Promise<PosStatus | null> {
    const { data, error } = await supabase!.rpc("pos_status", { target_bar: barId });
    if (error) throw error;
    const row = (data as { provider: string; merchant_name: string; connected_at: string; last_synced_at: string | null; last_error: string | null }[])
        .find((r) => r.provider === "square");
    return row ? { provider: row.provider, merchantName: row.merchant_name, connectedAt: row.connected_at, lastSyncedAt: row.last_synced_at, lastError: row.last_error } : null;
}

// Ask the server for the Square approval link, then go there
//     In the iPhone app, Square opens in Safari and comes back to the website (it can't
//     come back to the app yet); the connection is saved either way, so the app sees it
export async function connectSquare(barId: string): Promise<string | null> {
    const returnUrl = isNative ? WEB_ADDRESS : location.origin + location.pathname;
    const result = await callSquare({ action: "connect", barId, returnUrl });
    if (!result.ok) return result.error;
    location.href = (result.data as { url: string }).url;
    return null;
}

export async function disconnectSquare(barId: string): Promise<string | null> {
    const result = await callSquare({ action: "disconnect", barId });
    return result.ok ? null : result.error;
}

// "2026-11-20" + 1 -> "2026-11-21" (done in UTC so clocks changing can't skip a day)
export function addDays(date: string, days: number): string {
    return new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}

// The local calendar day of a moment: "2026-11-21T03:00:00Z" -> "2026-11-20" in New York
export function localDate(iso: string): string {
    const d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export interface ImportedDay {
    day: string;           // the day the sales are for
    importedOn: string;    // the local day it was imported
}

// A day is finished once it was imported on a LATER day (the bar had closed by then)
export function isFinished(d: ImportedDay): boolean {
    return d.importedOn > d.day;
}

// Which days to fetch
//     start = the day after the newest finished day, or 14 days ago the first time
//     end   = today, but at most 31 days after start (a long gap takes a few syncs)
export function daysToSync(todayDate: string, imported: ImportedDay[]): { start: string; end: string } {
    const newest = imported.filter(isFinished).reduce((a, d) => (d.day > a ? d.day : a), "");
    const start = newest ? addDays(newest, 1) : addDays(todayDate, -FIRST_SYNC_DAYS);
    const cap = addDays(start, MAX_DAYS_PER_SYNC - 1);
    return { start, end: cap < todayDate ? cap : todayDate };
}

export function squareDays(): ImportedDay[] {
    return db.salesImports
        .filter((i) => i.name.startsWith(PREFIX))
        .map((i) => ({ day: i.startDate, importedOn: localDate(i.importedAt) }));
}

// Should the page sync by itself? Only if this browser hasn't tried in the last hour
// (remembering the TRY, not the result, so a day with no sales can't cause a loop)
const LAST_TRY_KEY = "agave.squareLastTry";

export function syncDue(): boolean {
    try {
        return Date.now() - Number(sessionStorage.getItem(LAST_TRY_KEY) ?? 0) > 3600000;
    } catch {
        return false;
    }
}

function rememberTry() {
    try { sessionStorage.setItem(LAST_TRY_KEY, String(Date.now())); } catch { /* private mode: just don't auto-sync */ }
}

export interface SyncResult {
    days: number;       // days added
    orders: number;
    message: string;
}

// Fetch the missing days from Square and add each as a sales import
//     FOR each day Square returns:
//         IF it's already in and finished -> skip it
//         IF it's in but wasn't finished (imported that same day) -> replace it
// Only one sync at a time: a second call while one is running gets the same result
let running: Promise<SyncResult | string> | null = null;

export function syncSquare(barId: string): Promise<SyncResult | string> {
    running ??= runSync(barId).finally(() => { running = null; });
    return running;
}

async function runSync(barId: string): Promise<SyncResult | string> {
    rememberTry();
    const range = daysToSync(today(), squareDays());

    // Local midnight at the start of the first day, to local midnight after the last day
    const [y1, m1, d1] = range.start.split("-").map(Number);
    const [y2, m2, d2] = addDays(range.end, 1).split("-").map(Number);
    const result = await callSquare({
        action: "sync", barId,
        start: new Date(y1, m1 - 1, d1).toISOString(),
        end: new Date(y2, m2 - 1, d2).toISOString(),
        offsetMinutes: -new Date().getTimezoneOffset()
    });
    if (!result.ok) return result.error;

    const { days, orders } = result.data as { days: { date: string; rows: { itemName: string; quantity: number; revenue: number }[] }[]; orders: number };
    let added = 0;
    for (const day of days) {
        const existing = db.salesImports.find((i) => i.name === PREFIX + day.date);
        if (existing && isFinished({ day: day.date, importedOn: localDate(existing.importedAt) })) continue;
        if (existing) deleteSalesImport(existing.id);
        if (day.rows.length === 0) continue;
        importSales(PREFIX + day.date, day.date, day.date, day.rows);
        added++;
    }
    const message = added === 0
        ? "No Square sales from " + range.start + " to " + range.end + "."
        : "Updated " + added + (added === 1 ? " day" : " days") + " of Square sales (" + orders + " orders), through today so far.";
    return { days: added, orders, message };
}

// Call the server function; turn its errors into a message
type Reply = { ok: true; data: unknown } | { ok: false; error: string };

async function callSquare(body: Record<string, unknown>): Promise<Reply> {
    const { data, error } = await supabase!.functions.invoke("square", { body });
    if (!error) return { ok: true, data };
    try {
        const detail = await (error as { context?: Response }).context?.json();
        if (detail?.error) return { ok: false, error: detail.error };
    } catch { /* not a JSON error body */ }
    return { ok: false, error: "Couldn't reach the Square connection. Is the server function deployed? (" + error.message + ")" };
}
