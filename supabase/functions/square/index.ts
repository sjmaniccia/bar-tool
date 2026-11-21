// ===== square/index.ts =====
// Agave's Square connection. Runs on Supabase's servers (a Deno "Edge Function"),
// so Square's keys never reach the browser.
//
//     POST {action: "connect", barId, returnUrl}    -> {url}: the Square page where the owner approves Agave
//     GET  ?code=...&state=...                      <- Square sends the owner back here after approving
//     POST {action: "sync", barId, start, end, offsetMinutes} -> {days}: sales per day from Square
//     POST {action: "disconnect", barId}            -> removes Agave's access in Square and here
//
// Deployed with --no-verify-jwt because Square's redirect (the GET) can't sign in.
// Every POST checks the caller's sign-in and role itself (owner or manager).
//
// Secrets it needs (set with `npx supabase secrets set`, see SETUP-SQUARE.md):
//     SQUARE_ENV         "sandbox" (test) or "production"
//     SQUARE_APP_ID      the Square application ID for that environment
//     SQUARE_APP_SECRET  the Square application secret for that environment
//     APP_URLS           where Agave runs, comma-separated (only these can be returned to)

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { salesByDay, type SquareOrder } from "../_shared/square-orders.ts";

const SQUARE_VERSION = "2025-01-23";
const SCOPES = ["MERCHANT_PROFILE_READ", "ORDERS_READ", "ITEMS_READ"];
const STATE_MINUTES = 15;   // how long a "Connect Square" click stays valid

const env = (name: string) => Deno.env.get(name) ?? "";
// SQUARE_BASE_URL is only for testing against a stand-in Square; leave it unset
const squareBase = () => env("SQUARE_BASE_URL") || (env("SQUARE_ENV") === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com");

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// The server's own database client: it can read the keys tables (Row Level Security doesn't apply)
function admin(): SupabaseClient {
    let key = env("SUPABASE_SERVICE_ROLE_KEY");
    try {
        key = JSON.parse(env("SUPABASE_SECRET_KEYS")).default ?? key;
    } catch { /* older projects only have the service role key */ }
    return createClient(env("SUPABASE_URL"), key, { auth: { persistSession: false } });
}

// Who is calling, and can they manage this bar's POS?
//     IF no valid sign-in -> 401
//     IF not an owner or manager of the bar -> 403
async function requireManager(db: SupabaseClient, req: Request, barId: string): Promise<string | Response> {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return json({ error: "Sign in first." }, 401);
    const { data: member } = await db.from("members").select("role").eq("bar_id", barId).eq("user_id", data.user.id).maybeSingle();
    if (!member || !["owner", "manager"].includes(member.role)) return json({ error: "Only owners and managers can manage the Square connection." }, 403);
    return data.user.id;
}

// A call to Square's API with a bar's access token
async function square(path: string, token: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(squareBase() + path, {
        method: body ? "POST" : "GET",
        headers: { "Square-Version": SQUARE_VERSION, "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error("Square " + path + ": " + (data.errors?.[0]?.detail ?? res.status));
    return data;
}

// Trade a code (after approval) or a refresh token for a fresh access token
async function obtainToken(grant: { code: string } | { refresh_token: string }) {
    const res = await fetch(squareBase() + "/oauth2/token", {
        method: "POST",
        headers: { "Square-Version": SQUARE_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: env("SQUARE_APP_ID"),
            client_secret: env("SQUARE_APP_SECRET"),
            grant_type: "code" in grant ? "authorization_code" : "refresh_token",
            ...grant
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error("Square token: " + (data.errors?.[0]?.detail ?? data.message ?? res.status));
    return data as { access_token: string; refresh_token?: string; expires_at?: string; merchant_id?: string };
}


// ===== Connect: build the Square approval link =====
async function connect(db: SupabaseClient, req: Request, body: { barId: string; returnUrl: string }) {
    const user = await requireManager(db, req, body.barId);
    if (user instanceof Response) return user;
    // Only send people back to Agave itself, never to a link someone slipped in
    const allowed = env("APP_URLS").split(",").map((u) => u.trim()).filter(Boolean);
    if (!allowed.some((u) => body.returnUrl.startsWith(u))) return json({ error: "That page isn't on the list of Agave addresses (APP_URLS)." }, 400);

    const state = crypto.randomUUID() + crypto.randomUUID();
    const { error } = await db.from("oauth_states").insert({ state, bar_id: body.barId, user_id: user, provider: "square", return_url: body.returnUrl });
    if (error) throw error;

    const url = new URL(squareBase() + "/oauth2/authorize");
    url.searchParams.set("client_id", env("SQUARE_APP_ID"));
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("session", "false");
    url.searchParams.set("state", state);
    return json({ url: url.toString() });
}

// ===== Callback: Square sends the owner back here =====
//     Check the one-time state, trade the code for keys, save them, go back to Agave
async function callback(db: SupabaseClient, url: URL) {
    const state = url.searchParams.get("state") ?? "";
    const { data: saved } = await db.from("oauth_states").select("*").eq("state", state).maybeSingle();
    if (!saved) return new Response("This link has expired. Go back to Agave and click Connect Square again.", { status: 400 });
    await db.from("oauth_states").delete().eq("state", state);

    const back = (result: string) => Response.redirect(saved.return_url.split("#")[0] + "#/sales?square=" + result, 302);
    if (Date.now() - Date.parse(saved.created_at) > STATE_MINUTES * 60000) return back("expired");
    const code = url.searchParams.get("code");
    if (!code) return back("declined");

    try {
        const token = await obtainToken({ code });
        let merchantName = "";
        try {
            const me = await square("/v2/merchants", token.access_token) as { merchant?: { business_name?: string }[] };
            merchantName = me.merchant?.[0]?.business_name ?? "";
        } catch { /* the name is nice to have, not required */ }
        const { error } = await db.from("pos_connections").upsert({
            bar_id: saved.bar_id, provider: "square", merchant_id: token.merchant_id ?? null, merchant_name: merchantName,
            access_token: token.access_token, refresh_token: token.refresh_token ?? null, expires_at: token.expires_at ?? null,
            connected_by: saved.user_id, connected_at: new Date().toISOString(), last_error: null
        });
        if (error) throw error;
        return back("connected");
    } catch (e) {
        console.error(e);
        return back("error");
    }
}

// ===== Sync: sales per day between two moments =====
//     Refresh the key IF it expires within a day (Square keys last 30 days)
//     FOR each group of up to 10 locations: page through completed orders
//     Group them into days in the bar's local time
async function sync(db: SupabaseClient, req: Request, body: { barId: string; start: string; end: string; offsetMinutes: number }) {
    const user = await requireManager(db, req, body.barId);
    if (user instanceof Response) return user;
    const { data: conn } = await db.from("pos_connections").select("*").eq("bar_id", body.barId).eq("provider", "square").maybeSingle();
    if (!conn) return json({ error: "Square isn't connected for this bar." }, 404);

    try {
        let token = conn.access_token as string;
        if (conn.expires_at && Date.parse(conn.expires_at) - Date.now() < 24 * 3600000 && conn.refresh_token) {
            const fresh = await obtainToken({ refresh_token: conn.refresh_token });
            token = fresh.access_token;
            await db.from("pos_connections").update({
                access_token: fresh.access_token, refresh_token: fresh.refresh_token ?? conn.refresh_token, expires_at: fresh.expires_at ?? null
            }).eq("bar_id", body.barId).eq("provider", "square");
        }

        const { locations = [] } = await square("/v2/locations", token) as { locations?: { id: string; status?: string }[] };
        const ids = locations.filter((l) => l.status !== "INACTIVE").map((l) => l.id);
        const orders: SquareOrder[] = [];
        for (let i = 0; i < ids.length; i += 10) {
            let cursor: string | undefined;
            do {
                const page = await square("/v2/orders/search", token, {
                    location_ids: ids.slice(i, i + 10),
                    limit: 500,
                    cursor,
                    query: {
                        filter: {
                            state_filter: { states: ["COMPLETED"] },
                            date_time_filter: { closed_at: { start_at: body.start, end_at: body.end } }
                        },
                        sort: { sort_field: "CLOSED_AT", sort_order: "ASC" }
                    }
                }) as { orders?: SquareOrder[]; cursor?: string };
                orders.push(...(page.orders ?? []));
                cursor = page.cursor;
            } while (cursor);
        }

        await db.from("pos_connections").update({ last_synced_at: new Date().toISOString(), last_error: null })
            .eq("bar_id", body.barId).eq("provider", "square");
        return json({ days: salesByDay(orders, body.offsetMinutes), orders: orders.length });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await db.from("pos_connections").update({ last_error: message }).eq("bar_id", body.barId).eq("provider", "square");
        return json({ error: message }, 502);
    }
}

// ===== Disconnect: tell Square to drop Agave's access, then forget the keys =====
async function disconnect(db: SupabaseClient, req: Request, body: { barId: string }) {
    const user = await requireManager(db, req, body.barId);
    if (user instanceof Response) return user;
    const { data: conn } = await db.from("pos_connections").select("access_token").eq("bar_id", body.barId).eq("provider", "square").maybeSingle();
    if (conn) {
        await fetch(squareBase() + "/oauth2/revoke", {
            method: "POST",
            headers: { "Square-Version": SQUARE_VERSION, "Authorization": "Client " + env("SQUARE_APP_SECRET"), "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: env("SQUARE_APP_ID"), access_token: conn.access_token })
        }).catch(() => { /* forget the keys here even if Square can't be reached */ });
        await db.from("pos_connections").delete().eq("bar_id", body.barId).eq("provider", "square");
    }
    return json({ ok: true });
}


// ===== Router =====
Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const db = admin();
    const url = new URL(req.url);
    try {
        if (req.method === "GET") return await callback(db, url);
        const body = await req.json();
        if (typeof body.barId !== "string") return json({ error: "Missing barId." }, 400);
        if (body.action === "connect") return await connect(db, req, body);
        if (body.action === "sync") return await sync(db, req, body);
        if (body.action === "disconnect") return await disconnect(db, req, body);
        return json({ error: "Unknown action." }, 400);
    } catch (e) {
        console.error(e);
        return json({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
    }
});
