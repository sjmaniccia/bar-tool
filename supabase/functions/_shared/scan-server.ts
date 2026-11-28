// ===== scan-server.ts =====
// What the two scanning functions (scan-invoice, scan-recipes) share:
//     CHECK   the caller is signed in and an owner or manager of the bar
//     CLAIM   one scan from the bar's allowance (scanning.sql, recipe-scanning.sql)
//             IF the bar is at its limit -> stop before anything is sent to Claude
//     ASK     Claude to fill in a "tool" (a form with a fixed shape) from the photos
//             IF Claude can't be reached or refuses (not billed) -> give the scan back
//
// Secrets (Supabase > Edge Functions > Secrets, see SETUP-SCANNING.md):
//     ANTHROPIC_API_KEY   from the Claude Console
//     ANTHROPIC_MODEL     optional; defaults to claude-haiku-5-5

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ScanKind = "invoice" | "recipe";

const MAX_PAGE_CHARS = 7_000_000;   // about 5 MB of photo once decoded
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const env = (name: string) => Deno.env.get(name) ?? "";

export const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export function admin(): SupabaseClient {
    let key = env("SUPABASE_SERVICE_ROLE_KEY");
    try {
        key = JSON.parse(env("SUPABASE_SECRET_KEYS")).default ?? key;
    } catch { /* older projects only have the service role key */ }
    return createClient(env("SUPABASE_URL"), key, { auth: { persistSession: false } });
}

// Signed in, and an owner or manager of this bar (or one of `roles`)? -> the user's id, or the refusal to send back
export async function allowed(req: Request, barId: string, what: string, roles = ["owner", "manager"]): Promise<string | Response> {
    const db = admin();
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return json({ error: "Sign in first." }, 401);
    const { data: member } = await db.from("members").select("role").eq("bar_id", barId).eq("user_id", data.user.id).maybeSingle();
    if (!member || !roles.includes(member.role)) return json({ error: roles.includes("staff") ? "You're not part of this place." : "Only owners and managers can scan " + what + "." }, 403);
    return data.user.id;
}

export interface Image {
    mediaType: string;
    data: string;
}

// The photos from the request, checked -> the photos, or the refusal to send back
export function readImages(body: { images?: Image[] }, max: number): Image[] | Response {
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length === 0 || images.length > max) return json({ error: max === 1 ? "Send one photo." : "Send 1 to " + max + " photos." }, 400);
    for (const image of images) {
        if (!MEDIA_TYPES.includes(image.mediaType) || typeof image.data !== "string" || image.data.length > MAX_PAGE_CHARS) {
            return json({ error: "Photos must be JPEG, PNG or WebP and under 5 MB each." }, 400);
        }
    }
    if (!env("ANTHROPIC_API_KEY")) return json({ error: "Scanning isn't set up yet: add ANTHROPIC_API_KEY in Supabase secrets." }, 500);
    return images;
}

export interface Usage {
    scan_id: number | null;
    today_count: number;
    month_count: number;
    daily_limit: number;
    monthly_limit: number;
}

// Take one scan from the bar's allowance -> the usage, or the refusal to send back
export async function claimScan(barId: string, userId: string, pages: number, kind: ScanKind): Promise<Usage | Response> {
    const args: Record<string, unknown> = { target_bar: barId, who: userId, page_count: pages };
    if (kind !== "invoice") args.scan_kind = kind;   // invoices work before recipe-scanning.sql is run
    const { data, error } = await admin().rpc("claim_scan", args);
    if (error) {
        console.error(error);
        const file = kind === "invoice" ? "supabase/scanning.sql" : "supabase/recipe-scanning.sql";
        return json({ error: "Scan limits aren't set up yet: run " + file + " in the SQL Editor." }, 500);
    }
    const usage = (data as Usage[])[0];
    if (usage.scan_id === null) {
        const daily = usage.today_count >= usage.daily_limit;
        const noun = kind === "invoice" ? "scans" : "recipe pages";
        return json({
            error: daily
                ? "This bar has used its " + usage.daily_limit + " " + noun + " for today. Try again tomorrow."
                : "This bar has used its " + usage.monthly_limit + " " + noun + " for this month. They reset on the 1st.",
            usage
        }, 429);
    }
    return usage;
}

async function releaseScan(scanId: number) {
    const { error } = await admin().rpc("release_scan", { scan_id: scanId });
    if (error) console.error(error);
}

export interface Tool {
    name: string;
    description: string;
    input_schema: unknown;
}

// Ask Claude to fill in the tool from the photos -> what it filled in, or the refusal to send back
//     IF the call fails before Claude answers (not billed) -> the scan is given back
export async function askClaude(images: Image[], tool: Tool, instructions: string, maxTokens: number, scanId: number, what: string)
    : Promise<{ input: unknown; cutOff: boolean } | Response> {
    const request = {
        method: "POST",
        headers: {
            "x-api-key": env("ANTHROPIC_API_KEY"),
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        body: JSON.stringify({
            model: env("ANTHROPIC_MODEL") || "claude-haiku-5-5",
            max_tokens: maxTokens,
            tools: [tool],
            tool_choice: { type: "tool", name: tool.name },
            messages: [{
                role: "user",
                content: [
                    ...images.map((image) => ({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } })),
                    { type: "text", text: instructions }
                ]
            }]
        })
    };
    let res: Response;
    try {
        res = await fetch((env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com") + "/v1/messages", request);
    } catch (e) {
        await releaseScan(scanId);
        throw e;
    }
    const answer = await res.json();
    if (!res.ok) {
        console.error(answer);
        await releaseScan(scanId);
        return json({ error: "Claude couldn't read the " + what + ": " + (answer.error?.message ?? res.status) }, 502);
    }
    const call = (answer.content ?? []).find((c: { type: string }) => c.type === "tool_use");
    if (!call) return json({ error: "Claude didn't return the " + what + ". Try again." }, 502);
    return { input: call.input, cutOff: answer.stop_reason === "max_tokens" };
}
