// ===== scan-waste/index.ts =====
// Reads a paper waste log (1 to 4 photos) with Claude and returns its lines as data.
//
//     POST {barId, images: [{mediaType, data (base64)}]}  -> {lines, warnings, usage}
//     see _shared/waste-scan.ts for the shape
//
//     WHO     anyone in the place, staff too: staff keep the waste log
//     COUNTS  against the place's invoice scan allowance (a waste sheet is about one a week,
//             so it doesn't need its own; no SQL to run)
// Nothing is saved here: the app shows the lines for review first.

import { allowed, askClaude, claimScan, CORS, json, readImages } from "../_shared/scan-server.ts";
import { cleanWaste, WASTE_INSTRUCTIONS, WASTE_TOOL } from "../_shared/waste-scan.ts";

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    try {
        const body = await req.json();
        if (typeof body.barId !== "string") return json({ error: "Missing barId." }, 400);
        const userId = await allowed(req, body.barId, "waste logs", ["owner", "manager", "staff"]);
        if (userId instanceof Response) return userId;
        const images = readImages(body, 4);
        if (images instanceof Response) return images;

        const usage = await claimScan(body.barId, userId, images.length, "invoice");
        if (usage instanceof Response) return usage;
        const answer = await askClaude(images, WASTE_TOOL, WASTE_INSTRUCTIONS, 4000, usage.scan_id!, "the waste log");
        if (answer instanceof Response) return answer;

        const { lines, warnings } = cleanWaste(answer.input);
        if (answer.cutOff) warnings.push("This sheet has a lot on it and may be cut off. Check the last lines.");
        return json({ lines, warnings, usage });
    } catch (e) {
        console.error(e);
        return json({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
    }
});
