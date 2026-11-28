// ===== invoice-copy/index.ts =====
// After a scanned invoice is saved, a copy goes to the place's owners by email, with the
// photos attached. Runs on its own: the person scanning doesn't press anything.
//
//     POST {barId, invoice: {vendor, number, date, lines, charges, total}, photos: [{mediaType, data}]}
//         -> {emailed: number} (how many owners it went to; 0 = email isn't set up yet)
//
//     WHO     owners and managers of the place can send (the same people who scan)
//     TO      every owner of the place, looked up here (never taken from the request)
//     SENDS   one email per owner through Resend, with a "Shouldn't be getting this?" note
//             pointing at the Account page, where a place can be handed to its real owner
//
// Secrets (Supabase > Edge Functions > Secrets):
//     RESEND_API_KEY   from resend.com > API Keys (already set for feedback)
//     INVOICE_FROM     who it's from, on a domain verified in Resend, e.g.
//                      "Agave <invoices@getagaveapp.com>"
// FIXME: needs a verified domain. Until INVOICE_FROM is set, nothing is sent (emailed: 0):
//        Resend's test sender only delivers to the Resend account's own email.

import { admin, allowed, CORS, env, json } from "../_shared/scan-server.ts";
import { invoiceEmail, type InvoiceCopy } from "../_shared/invoice-email.ts";

const WEB_ADDRESS = "https://sjmaniccia.github.io/bar-tool/";
const MAX_PHOTOS = 6;
const MAX_PHOTO_CHARS = 7_000_000;      // ~5 MB of picture, as text
const MAX_LINES = 300;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    try {
        const body = await req.json().catch(() => ({}));
        const barId = String(body.barId ?? "");
        const userId = await allowed(req, barId, "invoices");
        if (userId instanceof Response) return userId;

        const key = env("RESEND_API_KEY");
        const from = env("INVOICE_FROM");
        if (!key || !from) return json({ emailed: 0, reason: "Email isn't set up yet." });

        // The invoice, checked: numbers are numbers, not too many lines or photos
        const inv = body.invoice ?? {};
        const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);
        const lines = (Array.isArray(inv.lines) ? inv.lines : []).slice(0, MAX_LINES)
            .map((l: Record<string, unknown>) => ({ name: String(l.name ?? ""), quantity: num(l.quantity), unitPrice: num(l.unitPrice), amount: num(l.amount) }));
        const charges = (Array.isArray(inv.charges) ? inv.charges : []).slice(0, 30)
            .map((c: Record<string, unknown>) => ({ name: String(c.name ?? ""), amount: num(c.amount) }));
        const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, MAX_PHOTOS)
            .filter((p: { mediaType?: string; data?: unknown }) => ["image/jpeg", "image/png", "image/webp"].includes(p.mediaType ?? "") && typeof p.data === "string" && p.data.length <= MAX_PHOTO_CHARS);

        // The place, who scanned it, and its owners, from the database
        const db = admin();
        const { data: bar } = await db.from("bars").select("name").eq("id", barId).single();
        const { data: members } = await db.from("members").select("*").eq("bar_id", barId);
        const owners = (members ?? []).filter((m) => m.role === "owner" && m.email);
        const me = (members ?? []).find((m) => m.user_id === userId);
        if (owners.length === 0) return json({ emailed: 0 });

        const copy: InvoiceCopy = {
            barName: bar?.name ?? "your place",
            scannedBy: me?.display_name || me?.email || "Someone",
            vendor: String(inv.vendor ?? ""),
            number: String(inv.number ?? ""),
            date: String(inv.date ?? ""),
            lines,
            charges,
            total: num(inv.total),
            accountUrl: WEB_ADDRESS + "#/account"
        };
        const mail = invoiceEmail(copy);
        const ext: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
        const attachments = photos.map((p: { mediaType: string; data: string }, i: number) => ({
            filename: "invoice-page-" + (i + 1) + "." + ext[p.mediaType],
            content: p.data
        }));

        // One email per owner, so nobody sees the others' addresses
        let emailed = 0;
        for (const owner of owners) {
            const sent = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
                body: JSON.stringify({ from, to: [owner.email], subject: mail.subject, text: mail.text, html: mail.html, attachments })
            });
            if (sent.ok) emailed++;
            else console.error("invoice copy to an owner failed", sent.status, await sent.text());
        }
        return json({ emailed });
    } catch (e) {
        console.error(e);
        return json({ error: "Couldn't send the copy." }, 500);
    }
});
