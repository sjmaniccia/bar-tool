// ===== delete-account/index.ts =====
// Deletes the signed-in person's account (the App Store requires this to be in the app).
//
//     POST {}                 -> {plan}   what WOULD happen, changes nothing
//     POST {confirm: true}    -> {done: true, plan}
//
//     CHECK   who's asking, from their sign-in token (nobody can delete someone else)
//     PLAN    places they own alone are deleted; others they just leave (_shared/account.ts)
//     DELETE  each of those places' recipe photos, then the place (its data, team, invite
//             links, sales connection and scan counts go with it: "on delete cascade")
//             then the sign-in itself (their memberships go with it)
// Needs the secret key, which Supabase gives every function automatically.

import { admin, CORS, json } from "../_shared/scan-server.ts";
import { deletionPlan, type Membership } from "../_shared/account.ts";

const PHOTO_BUCKET = "recipe-photos";

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    try {
        const db = admin();
        const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
        const { data: who, error: whoError } = await db.auth.getUser(token);
        if (whoError || !who.user) return json({ error: "Sign in first." }, 401);
        const userId = who.user.id;
        const body = await req.json().catch(() => ({}));

        // PLAN: every place they belong to, with how many owners and members it has
        const { data: mine, error: mineError } = await db.from("members").select("bar_id, role, bars(name)").eq("user_id", userId);
        if (mineError) throw mineError;
        const memberships: Membership[] = [];
        for (const row of mine ?? []) {
            const { data: everyone, error } = await db.from("members").select("user_id, role").eq("bar_id", row.bar_id);
            if (error) throw error;
            memberships.push({
                barId: row.bar_id,
                barName: (row.bars as { name?: string } | null)?.name ?? "Your place",
                role: row.role,
                owners: (everyone ?? []).filter((m) => m.role === "owner").length,
                others: (everyone ?? []).filter((m) => m.user_id !== userId).length
            });
        }
        const plan = deletionPlan(memberships);
        if (body.confirm !== true) return json({ plan });

        // DELETE the places they own alone: photos first (storage doesn't cascade), then the place
        for (const place of plan.deleted) {
            const { data: photos } = await db.storage.from(PHOTO_BUCKET).list(place.barId, { limit: 1000 });
            const paths = (photos ?? []).map((p) => place.barId + "/" + p.name);
            if (paths.length > 0) await db.storage.from(PHOTO_BUCKET).remove(paths);
            const { error } = await db.from("bars").delete().eq("id", place.barId);
            if (error) throw error;
        }
        // FIXME: more than 1000 photos in one place would leave the rest behind; loop with offset if that ever happens

        // DELETE the sign-in (memberships go with it)
        const { error: userError } = await db.auth.admin.deleteUser(userId);
        if (userError) throw userError;
        return json({ done: true, plan });
    } catch (e) {
        console.error(e);
        return json({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
    }
});
