// ===== scan-recipes/index.ts =====
// Reads ONE page of a recipe book with Claude and returns the recipes on it as data.
// The app sends a stack of pages one at a time, so a slow page doesn't hold up the rest
// and each page counts once against the bar's recipe allowance (recipe-scanning.sql).
//
//     POST {barId, images: [{mediaType, data (base64)}]}  (exactly 1 page)
//     -> {recipes, warnings, usage}   see _shared/recipe-scan.ts for the shape
//
//     CHECK, CLAIM a recipe page, ASK Claude   (_shared/scan-server.ts)
//     CLEAN the answer (amounts, units) and send it back
// Nothing is saved here: the app shows the recipes for review first.
// FIXME: cut out each recipe's picture and keep it in Supabase Storage.

import { allowed, askClaude, claimScan, CORS, json, readImages } from "../_shared/scan-server.ts";
import { cleanRecipes, RECIPE_INSTRUCTIONS, RECIPE_TOOL } from "../_shared/recipe-scan.ts";

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    try {
        const body = await req.json();
        if (typeof body.barId !== "string") return json({ error: "Missing barId." }, 400);
        const userId = await allowed(req, body.barId, "recipes");
        if (userId instanceof Response) return userId;
        const images = readImages(body, 1);
        if (images instanceof Response) return images;

        const usage = await claimScan(body.barId, userId, 1, "recipe");
        if (usage instanceof Response) return usage;
        const answer = await askClaude(images, RECIPE_TOOL, RECIPE_INSTRUCTIONS, 6000, usage.scan_id!, "recipes");
        if (answer instanceof Response) return answer;

        const { recipes, warnings } = cleanRecipes(answer.input);
        if (answer.cutOff) warnings.push("This page has a lot on it and may be cut off. Check the last recipe.");
        return json({ recipes, warnings, usage });
    } catch (e) {
        console.error(e);
        return json({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
    }
});
