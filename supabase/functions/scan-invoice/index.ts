// ===== scan-invoice/index.ts =====
// Reads invoice photos with Claude and returns the lines as data.
// Runs on Supabase's servers so the Claude API key never reaches the browser.
//
//     POST {barId, images: [{mediaType, data (base64)}]}  (1 to 4 pages of one invoice)
//     -> {invoice, warnings, usage}   see _shared/invoice-scan.ts for the shape
//
//     CHECK, CLAIM a scan, ASK Claude   (_shared/scan-server.ts)
//     CLEAN the answer (numbers, split cases, missing prices, math checks) and send it back
// Nothing is saved here: the app shows the result for review first.
// FIXME: keep the photos in Supabase Storage so an approved invoice can show its original.

import { allowed, askClaude, claimScan, CORS, json, readImages } from "../_shared/scan-server.ts";
import { cleanScan, INSTRUCTIONS, INVOICE_TOOL } from "../_shared/invoice-scan.ts";

const MAX_PAGES = 4;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    try {
        const body = await req.json();
        if (typeof body.barId !== "string") return json({ error: "Missing barId." }, 400);
        const userId = await allowed(req, body.barId, "invoices");
        if (userId instanceof Response) return userId;
        const images = readImages(body, MAX_PAGES);
        if (images instanceof Response) return images;

        const usage = await claimScan(body.barId, userId, images.length, "invoice");
        if (usage instanceof Response) return usage;
        const answer = await askClaude(images, INVOICE_TOOL, INSTRUCTIONS, 8000, usage.scan_id!, "invoice");
        if (answer instanceof Response) return answer;

        const { invoice, warnings } = cleanScan(answer.input);
        if (answer.cutOff) warnings.push("This invoice is very long and may be cut off. Check the last lines.");
        return json({ invoice, warnings, usage });
    } catch (e) {
        console.error(e);
        return json({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
    }
});
