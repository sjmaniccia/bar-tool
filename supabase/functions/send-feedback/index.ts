// ===== send-feedback/index.ts =====
// The suggestion box: save the message, then email it to Agave's inbox.
//
//     POST {kind, message, page, app, barId}  -> {saved: true, emailed: true|false}
//
//     SAVE   through send_feedback() as the signed-in person (feedback.sql), so its
//            checks still apply: signed in, real kind, not empty, 20 a day
//     EMAIL  through Resend (an email service with a plain web API; Supabase's servers
//            can't send straight through Gmail). Reply-to is the sender.
//            IF the email can't go out -> the message is still saved: say so, don't fail
//
// Secrets (Supabase > Edge Functions > Secrets):
//     RESEND_API_KEY   from resend.com > API Keys
//     FEEDBACK_TO      optional; where the emails go (default getagaveapp@gmail.com)

import { createClient } from "npm:@supabase/supabase-js@2";
import { admin, CORS, env, json } from "../_shared/scan-server.ts";
import { feedbackEmail } from "../_shared/feedback-email.ts";

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    try {
        const body = await req.json().catch(() => ({}));
        const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");

        // SAVE as the person themselves: the database fills in who they are
        const asThem = createClient(env("SUPABASE_URL"), req.headers.get("apikey") ?? "", {
            global: { headers: { Authorization: "Bearer " + token } },
            auth: { persistSession: false }
        });
        const { data: id, error } = await asThem.rpc("send_feedback", {
            feedback_kind: body.kind,
            feedback_message: body.message,
            feedback_page: body.page ?? null,
            feedback_app: body.app ?? null,
            target_bar: body.barId ?? null
        });
        if (error) return json({ error: error.message }, 400);

        // EMAIL: read back what was saved (the trusted email and place), then send
        const key = env("RESEND_API_KEY");
        if (!key) return json({ saved: true, emailed: false });
        const db = admin();
        const { data: row } = await db.from("feedback").select("kind, message, email, page, app, bars(name)").eq("id", id).single();
        if (!row) return json({ saved: true, emailed: false });
        const mail = feedbackEmail({
            kind: row.kind,
            message: row.message,
            email: row.email ?? "",
            placeName: (row.bars as { name?: string } | null)?.name ?? "",
            page: row.page ?? "",
            app: row.app ?? ""
        });
        const sent = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
            body: JSON.stringify({
                from: "Agave Feedback <onboarding@resend.dev>",
                to: [env("FEEDBACK_TO") || "getagaveapp@gmail.com"],
                reply_to: mail.replyTo,
                subject: mail.subject,
                text: mail.text
            })
        });
        if (!sent.ok) console.error("Resend:", sent.status, await sent.text());
        return json({ saved: true, emailed: sent.ok });
    } catch (e) {
        console.error(e);
        return json({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
    }
});
