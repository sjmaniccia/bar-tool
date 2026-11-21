// ===== square-test-sales.mjs =====
// Rings up a few fake sales in your Square SANDBOX (practice) account, so there's
// something for Agave to sync. Never touches real money; it refuses production tokens.
//
// Run from the bar-tool folder:
//     SQUARE_SANDBOX_TOKEN=EAAA... node supabase/square-test-sales.mjs
// The token is on developer.squareup.com > your app > Credentials > Sandbox access token.
//
//     FOR each fake sale:
//         create an order with drinks named like the sample recipes
//         pay for it with Square's test card, so it counts as a completed sale

const TOKEN = process.env.SQUARE_SANDBOX_TOKEN;
const BASE = "https://connect.squareupsandbox.com";
const VERSION = "2025-01-23";

// Names match the sample bar's recipes, so they match automatically in Agave
const SALES = [
    [["Daiquiri", 2, 1100], ["Lager Pint", 1, 600]],
    [["Margarita", 3, 1200]],
    [["Daiquiri", 1, 1100], ["Margarita", 1, 1200], ["Lager Pint", 2, 600]],
    [["Lager Pint", 4, 600]],
    [["Daiquiri", 3, 1100]]
];

if (!TOKEN) {
    console.log("Set SQUARE_SANDBOX_TOKEN first. See the comment at the top of this file.");
    process.exit(1);
}

async function square(method, path, body) {
    const res = await fetch(BASE + path, {
        method,
        headers: { "Square-Version": VERSION, "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(path + ": " + (data.errors?.[0]?.detail ?? res.status));
    return data;
}

const { locations } = await square("GET", "/v2/locations");
const location = locations.find((l) => l.status === "ACTIVE") ?? locations[0];
console.log("Ringing up " + SALES.length + " test sales at " + location.name + "...");

for (const items of SALES) {
    const { order } = await square("POST", "/v2/orders", {
        idempotency_key: crypto.randomUUID(),
        order: {
            location_id: location.id,
            line_items: items.map(([name, quantity, cents]) => ({
                name, quantity: String(quantity), base_price_money: { amount: cents, currency: "USD" }
            }))
        }
    });
    await square("POST", "/v2/payments", {
        idempotency_key: crypto.randomUUID(),
        source_id: "cnon:card-nonce-ok",     // Square's always-approved test card
        amount_money: order.total_money,
        order_id: order.id,
        location_id: location.id,
        autocomplete: true
    });
    // A fully paid order usually completes by itself; make sure it did
    const { order: paid } = await square("GET", "/v2/orders/" + order.id);
    if (paid.state !== "COMPLETED") {
        await square("PUT", "/v2/orders/" + order.id, { order: { location_id: location.id, version: paid.version, state: "COMPLETED" } });
    }
    console.log("  " + items.map(([n, q]) => q + " " + n).join(", "));
}
console.log("Done. In Agave, go to Sales and click Sync now.");
