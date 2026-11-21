// ===== scan-invoice/index.ts =====
// Reads invoice photos with Claude and returns the lines as data.
// Runs on Supabase's servers so the Claude API key never reaches the browser.
//
//     POST {barId, images: [{mediaType, data (base64)}]}  (1 to 4 pages)
//     -> {invoice, warnings}   see _shared/invoice-scan.ts for the shape
//
//     CHECK the caller is signed in and an owner or manager of the bar
//     CLAIM a scan (scanning.sql): IF the bar is at its daily or monthly limit -> stop here,
//         before anything is sent to Claude, so it costs nothing
//     SEND the photos to Claude with the record_invoice tool, which it must fill in
//     CLEAN the answer (numbers, missing prices, math checks) and send it back
// Nothing is saved here: the app shows the result for review first.
//
// Secrets it needs (Supabase > Edge Functions > Secrets, see SETUP-SCANNING.md):
//     ANTHROPIC_API_KEY   from console.anthropic.com
//     ANTHROPIC_MODEL     optional; defaults to claude-haiku-5-5
// FIXME: keep the photos in Supabase Storage so an approved invoice can show its original.
// The Anthropic account's own spend limit is the last line of defense if all else fails.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { cleanScan, INSTRUCTIONS, INVOICE_TOOL } from "../_shared/invoice-scan.ts";

const MAX_PAGES = 4;
const MAX_PAGE_CHARS = 7_000_000;   // about 5 MB of photo once decoded
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];

const env = (name: string) => Deno.env.get(name) ?? "";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function admin(): SupabaseClient {
    let key = env("SUPABASE_SERVICE_ROLE_KEY");
    try {
        key = JSON.parse(env("SUPABASE_SECRET_KEYS")).default ?? key;
    } catch { /* older projects only have the service role key */ }
    return createClient(env("SUPABASE_URL"), key, { auth: { persistSession: false } });
}

// Signed in, and an owner or manager of this bar? (staff can't record invoices)
//     -> the user's id, or the refusal to send back
async function allowed(req: Request, barId: string): Promise<string | Response> {
    const db = admin();
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return json({ error: "Sign in first." }, 401);
    const { data: member } = await db.from("members").select("role").eq("bar_id", barId).eq("user_id", data.user.id).maybeSingle();
    if (!member || !["owner", "manager"].includes(member.role)) return json({ error: "Only owners and managers can scan invoices." }, 403);
    return data.user.id;
}

interface Usage {
    scan_id: number | null;
    today_count: number;
    month_count: number;
    daily_limit: number;
    monthly_limit: number;
}

// Take one scan from the bar's allowance -> the usage, or the refusal to send back
async function claimScan(barId: string, userId: string, pages: number): Promise<Usage | Response> {
    const { data, error } = await admin().rpc("claim_scan", { target_bar: barId, who: userId, page_count: pages });
    if (error) {
        console.error(error);
        return json({ error: "Scan limits aren't set up yet: run supabase/scanning.sql in the SQL Editor." }, 500);
    }
    const usage = (data as Usage[])[0];
    if (usage.scan_id === null) {
        const daily = usage.today_count >= usage.daily_limit;
        return json({
            error: daily
                ? "This bar has used its " + usage.daily_limit + " scans for today. Type this invoice in, or scan it tomorrow."
                : "This bar has used its " + usage.monthly_limit + " scans for this month. They reset on the 1st.",
            usage
        }, 429);
    }
    return usage;
}

async function releaseScan(scanId: number) {
    const { error } = await admin().rpc("release_scan", { scan_id: scanId });
    if (error) console.error(error);
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    try {
        const body = await req.json() as { barId?: string; images?: { mediaType: string; data: string }[] };
        if (typeof body.barId !== "string") return json({ error: "Missing barId." }, 400);
        const userId = await allowed(req, body.barId);
        if (userId instanceof Response) return userId;

        const images = Array.isArray(body.images) ? body.images : [];
        if (images.length === 0 || images.length > MAX_PAGES) return json({ error: "Send 1 to " + MAX_PAGES + " photos." }, 400);
        for (const image of images) {
            if (!MEDIA_TYPES.includes(image.mediaType) || typeof image.data !== "string" || image.data.length > MAX_PAGE_CHARS) {
                return json({ error: "Photos must be JPEG, PNG or WebP and under 5 MB each." }, 400);
            }
        }
        if (!env("ANTHROPIC_API_KEY")) return json({ error: "Invoice scanning isn't set up yet: add ANTHROPIC_API_KEY in Supabase secrets." }, 500);

        const usage = await claimScan(body.barId, userId, images.length);
        if (usage instanceof Response) return usage;

        const request = {
            method: "POST",
            headers: {
                "x-api-key": env("ANTHROPIC_API_KEY"),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            body: JSON.stringify({
                model: env("ANTHROPIC_MODEL") || "claude-haiku-5-5",
                max_tokens: 8000,
                tools: [INVOICE_TOOL],
                tool_choice: { type: "tool", name: INVOICE_TOOL.name },
                messages: [{
                    role: "user",
                    content: [
                        ...images.map((image) => ({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } })),
                        { type: "text", text: INSTRUCTIONS }
                    ]
                }]
            })
        };

        // IF Claude can't be reached or refuses the request, it isn't billed: give the scan back
        let res: Response;
        try {
            res = await fetch((env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com") + "/v1/messages", request);
        } catch (e) {
            await releaseScan(usage.scan_id!);
            throw e;
        }
        const answer = await res.json();
        if (!res.ok) {
            console.error(answer);
            await releaseScan(usage.scan_id!);
            return json({ error: "Claude couldn't read the invoice: " + (answer.error?.message ?? res.status) }, 502);
        }
        const call = (answer.content ?? []).find((c: { type: string }) => c.type === "tool_use");
        if (!call) return json({ error: "Claude didn't return the invoice lines. Try again." }, 502);
        const { invoice, warnings } = cleanScan(call.input);
        if (answer.stop_reason === "max_tokens") warnings.push("This invoice is very long and may be cut off. Check the last lines.");
        return json({ invoice, warnings, usage });
    } catch (e) {
        console.error(e);
        return json({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
    }
});
