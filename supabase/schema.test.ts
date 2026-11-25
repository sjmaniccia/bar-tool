// ===== schema.test.ts =====
// Runs schema.sql in a real Postgres (PGlite, Postgres compiled to run inside Node)
// and checks the security rules by acting as different people.
//
// Supabase provides auth.users, auth.uid() and the "authenticated" role.
// Here they're stand-ins: auth.uid() reads whoever we say is signed in.
// Like new Supabase projects, nothing is granted to the app's roles unless
// schema.sql grants it, so a missing GRANT fails these tests.

import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const SUPABASE_STAND_IN = `
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
        $$ select jsonb_build_object('email', (select email from auth.users where id = auth.uid())) $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on all functions in schema auth to anon, authenticated;
    create publication supabase_realtime;
`;

const OWNER = "00000000-0000-0000-0000-00000000000a";
const STAFF = "00000000-0000-0000-0000-00000000000b";
const STRANGER = "00000000-0000-0000-0000-00000000000c";
const FAKER = "00000000-0000-0000-0000-00000000000d";   // signed up with an invited email, never confirmed it

let db: PGlite;
let barId = "";

// Run SQL as a signed-in person (or as nobody), the way a request from the app would
async function as(userId: string | null, sql: string, params: unknown[] = []) {
    await db.exec("reset role; select set_config('test.uid', '" + (userId ?? "") + "', false);");
    await db.exec(userId === null ? "set role anon;" : "set role authenticated;");
    try {
        return await db.query<Record<string, unknown>>(sql, params);
    } finally {
        await db.exec("reset role;");
    }
}

beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STAND_IN);
    await db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("./pos.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("./scanning.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("./recipe-scanning.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("./team-links.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("./feedback.sql", import.meta.url), "utf8"));
    await db.exec(`
        insert into auth.users values
            ('${OWNER}', 'owner@bar.com', now()),
            ('${STAFF}', 'staff@bar.com', now()),
            ('${STRANGER}', 'someone@else.com', now()),
            ('${FAKER}', 'invited@bar.com', null);
    `);
    const made = await as(OWNER, "select public.create_bar('Shady''s') as id");
    barId = made.rows[0].id as string;
});

describe("bars and invites", () => {
    test("creating a bar makes you its owner", async () => {
        const me = await as(OWNER, "select role from public.members where bar_id = $1", [barId]);
        expect(me.rows).toEqual([{ role: "owner" }]);
    });

    test("an invite is only taken by a confirmed email", async () => {
        await as(OWNER, "insert into public.invites (bar_id, email, role) values ($1, 'staff@bar.com', 'staff'), ($1, 'invited@bar.com', 'staff')", [barId]);
        const faker = await as(FAKER, "select public.accept_invites() as n");
        expect(faker.rows[0].n).toBe(0);
        const staff = await as(STAFF, "select public.accept_invites() as n");
        expect(staff.rows[0].n).toBe(1);
    });

    test("staff can't invite, managers can't invite managers", async () => {
        await expect(as(STAFF, "insert into public.invites (bar_id, email, role) values ($1, 'x@y.com', 'staff')", [barId])).rejects.toThrow();
        await as(OWNER, "select public.set_member_role($1, $2, 'manager')", [barId, STAFF]);
        await expect(as(STAFF, "insert into public.invites (bar_id, email, role) values ($1, 'boss@y.com', 'manager')", [barId])).rejects.toThrow();
        await as(STAFF, "insert into public.invites (bar_id, email, role) values ($1, 'new@y.com', 'staff')", [barId]);
        await as(OWNER, "select public.set_member_role($1, $2, 'staff')", [barId, STAFF]);
    });

    test("the last owner can't be removed or demoted", async () => {
        await expect(as(OWNER, "select public.remove_member($1, $2)", [barId, OWNER])).rejects.toThrow(/owner/);
        await expect(as(OWNER, "select public.set_member_role($1, $2, 'staff')", [barId, OWNER])).rejects.toThrow(/owner/);
        await expect(as(STAFF, "select public.set_member_role($1, $2, 'owner')", [barId, STAFF])).rejects.toThrow();
    });
});

describe("records", () => {
    test("owners write anything; staff only counts and waste", async () => {
        await as(OWNER, "insert into public.records (bar_id, kind, id, data) values ($1, 'recipes', 'r1', '{\"name\":\"Daiquiri\"}')", [barId]);
        await as(STAFF, "insert into public.records (bar_id, kind, id, data) values ($1, 'countLines', 'cl1', '{}')", [barId]);
        await expect(as(STAFF, "insert into public.records (bar_id, kind, id, data) values ($1, 'recipes', 'r2', '{}')", [barId])).rejects.toThrow();
        // An update that matches no allowed row just changes nothing
        const changed = await as(STAFF, "update public.records set data = '{\"name\":\"Free drinks\"}' where kind = 'recipes' returning id");
        expect(changed.rows).toEqual([]);
        // ...and staff can't sneak a count line into being a recipe
        await expect(as(STAFF, "update public.records set kind = 'recipes' where id = 'cl1'")).rejects.toThrow();
    });

    test("other bars and signed-out visitors see nothing", async () => {
        const stranger = await as(STRANGER, "select * from public.records");
        expect(stranger.rows).toEqual([]);
        await expect(as(STRANGER, "insert into public.records (bar_id, kind, id, data) values ($1, 'recipes', 'r3', '{}')", [barId])).rejects.toThrow();
        await expect(as(null, "select * from public.records")).rejects.toThrow();
    });

    test("changes are stamped with who made them", async () => {
        const row = await as(OWNER, "select updated_by from public.records where id = 'cl1'");
        expect(row.rows[0].updated_by).toBe(STAFF);
    });

    test("rows come back in the order they were made", async () => {
        await as(OWNER, "insert into public.records (bar_id, kind, id, data) values ($1, 'recipeLines', 'z', '{}'), ($1, 'recipeLines', 'a', '{}')", [barId]);
        const rows = await as(OWNER, "select id from public.records where kind = 'recipeLines' order by seq");
        expect(rows.rows.map((r) => r.id)).toEqual(["z", "a"]);
    });
});

describe("POS connections", () => {
    test("nobody in the app can read or write the keys", async () => {
        // The server (here: the superuser, like Supabase's secret key) saves a connection
        await db.exec(`insert into public.pos_connections (bar_id, provider, merchant_name, access_token)
            values ('${barId}', 'square', 'Shady''s Square', 'EAAA-secret-token')`);
        await expect(as(OWNER, "select access_token from public.pos_connections")).rejects.toThrow();
        await expect(as(OWNER, "insert into public.pos_connections (bar_id, provider, access_token) values ($1, 'toast', 'x')", [barId])).rejects.toThrow();
        await expect(as(OWNER, "select * from public.oauth_states")).rejects.toThrow();
    });

    test("members see connected or not, without keys; others see nothing", async () => {
        const mine = await as(STAFF, "select * from public.pos_status($1)", [barId]);
        expect(mine.rows).toHaveLength(1);
        expect(mine.rows[0]).toMatchObject({ provider: "square", merchant_name: "Shady's Square" });
        expect(Object.keys(mine.rows[0])).not.toContain("access_token");
        const theirs = await as(STRANGER, "select * from public.pos_status($1)", [barId]);
        expect(theirs.rows).toEqual([]);
    });
});

describe("invoice scan limits", () => {
    // The server function claims a scan as service_role, using the secret key
    async function claim(pages = 1) {
        await db.exec("set role service_role;");
        try {
            const r = await db.query<Record<string, unknown>>("select * from public.claim_scan($1, $2, $3)", [barId, OWNER, pages]);
            return r.rows[0];
        } finally {
            await db.exec("reset role;");
        }
    }

    test("nobody in the app can claim scans, delete them or change limits", async () => {
        await expect(as(OWNER, "select * from public.claim_scan($1, $2, 1)", [barId, OWNER])).rejects.toThrow();
        await expect(as(OWNER, "select public.release_scan(1)")).rejects.toThrow();
        await expect(as(OWNER, "delete from public.invoice_scans")).rejects.toThrow();
        await expect(as(OWNER, "insert into public.scan_limits values ($1, 9999, 9999)", [barId])).rejects.toThrow();
    });

    test("stops at the daily limit, and a released scan is given back", async () => {
        await db.exec(`insert into public.scan_limits values ('${barId}', 3, 300)`);
        expect(await claim()).toMatchObject({ today_count: 1, month_count: 1, daily_limit: 3 });
        await claim(2);
        const third = await claim();
        expect(third.scan_id).not.toBeNull();
        const fourth = await claim();
        expect(fourth).toMatchObject({ scan_id: null, today_count: 3 });

        await db.exec("set role service_role;");
        await db.query("select public.release_scan($1)", [third.scan_id]);
        await db.exec("reset role;");
        expect((await claim()).scan_id).not.toBeNull();
    });

    test("yesterday's scans don't count toward today's limit", async () => {
        await db.exec(`update public.invoice_scans set scanned_at = now() - interval '25 hours'`);
        const next = await claim();
        // (Whether yesterday is still this month depends on today's date, so only the day is exact)
        expect(next.today_count).toBe(1);
        expect(next.month_count as number).toBeGreaterThanOrEqual(1);
    });

    test("recipe pages have their own, separate allowance", async () => {
        const invoicesBefore = (await as(OWNER, "select * from public.scan_usage($1)", [barId])).rows[0];
        await db.exec("set role service_role;");
        try {
            const first = await db.query<Record<string, unknown>>("select * from public.claim_scan($1, $2, 1, 'recipe')", [barId, OWNER]);
            expect(first.rows[0]).toMatchObject({ today_count: 1, daily_limit: 150, monthly_limit: 600 });
            // (only you change limits, from the SQL Editor)
            await db.exec(`reset role; update public.scan_limits set recipe_daily_limit = 1 where bar_id = '${barId}'; set role service_role;`);
            const second = await db.query<Record<string, unknown>>("select * from public.claim_scan($1, $2, 1, 'recipe')", [barId, OWNER]);
            expect(second.rows[0]).toMatchObject({ scan_id: null, daily_limit: 1 });
            await expect(db.query("select * from public.claim_scan($1, $2, 1, 'pizza')", [barId, OWNER])).rejects.toThrow();
        } finally {
            await db.exec("reset role;");
        }
        // Invoices weren't touched by any of that
        const invoicesAfter = (await as(OWNER, "select * from public.scan_usage($1)", [barId])).rows[0];
        const recipes = await as(OWNER, "select * from public.scan_usage($1, 'recipe')", [barId]);
        expect(recipes.rows[0]).toMatchObject({ today_count: 1 });
        expect(invoicesAfter).toEqual(invoicesBefore);
    });

    test("members see usage; others see nothing", async () => {
        const mine = await as(STAFF, "select * from public.scan_usage($1)", [barId]);
        expect(mine.rows[0]).toMatchObject({ daily_limit: 3, monthly_limit: 300 });
        const theirs = await as(STRANGER, "select * from public.scan_usage($1)", [barId]);
        expect(theirs.rows).toEqual([]);
    });
});

describe("invite links", () => {
    const NEWBIE = "00000000-0000-0000-0000-0000000000e1";
    const NEWBIE2 = "00000000-0000-0000-0000-0000000000e2";

    test("an owner's staff link lets someone join as staff, once", async () => {
        await db.exec(`insert into auth.users values ('${NEWBIE}', 'Newbie@bar.com', null), ('${NEWBIE2}', 'two@bar.com', null)`);
        const code = (await as(OWNER, "select public.make_invite_link($1) as code", [barId])).rows[0].code as string;
        expect(code).toMatch(/^[0-9a-f]{64}$/);

        // Before signing in: what the link is for, and nothing else
        const peek = await as(null, "select * from public.peek_invite_link($1)", [code]);
        expect(peek.rows).toEqual([{ bar_name: "Shady's", role: "staff" }]);
        await expect(as(null, "select * from public.invite_links")).rejects.toThrow();
        await expect(as(null, "select public.join_with_link($1)", [code])).rejects.toThrow();

        const joined = await as(NEWBIE, "select public.join_with_link($1) as bar", [code]);
        expect(joined.rows[0].bar).toBe(barId);
        await as(NEWBIE, "select public.join_with_link($1)", [code]);   // again: no change
        const me = await as(NEWBIE, "select role, email from public.members where bar_id = $1 and user_id = $2", [barId, NEWBIE]);
        expect(me.rows).toEqual([{ role: "staff", email: "newbie@bar.com" }]);
        const link = await as(OWNER, "select uses from public.invite_links where code = $1", [code]);
        expect(link.rows[0].uses).toBe(1);
    });

    test("staff can't make links, can't see them, and managers can't make manager links", async () => {
        await expect(as(NEWBIE, "select public.make_invite_link($1)", [barId])).rejects.toThrow();
        expect((await as(NEWBIE, "select * from public.invite_links")).rows).toEqual([]);
        await expect(as(STRANGER, "select public.make_invite_link($1)", [barId])).rejects.toThrow();
        await as(OWNER, "select public.set_member_role($1, $2, 'manager')", [barId, STAFF]);
        await expect(as(STAFF, "select public.make_invite_link($1, 'manager')", [barId])).rejects.toThrow();
        const ok = await as(STAFF, "select public.make_invite_link($1, 'staff') as code", [barId]);
        expect(ok.rows[0].code).toBeTruthy();
        await as(OWNER, "select public.set_member_role($1, $2, 'staff')", [barId, STAFF]);
        await expect(as(OWNER, "insert into public.invite_links (code, bar_id, role) values ('x', $1, 'manager')", [barId])).rejects.toThrow();
    });

    test("a turned-off or expired link stops working", async () => {
        const code = (await as(OWNER, "select public.make_invite_link($1, 'manager') as code", [barId])).rows[0].code as string;
        await expect(as(NEWBIE, "select public.revoke_invite_link($1)", [code])).rejects.toThrow();
        await as(OWNER, "select public.revoke_invite_link($1)", [code]);
        expect((await as(null, "select * from public.peek_invite_link($1)", [code])).rows).toEqual([]);
        await expect(as(NEWBIE2, "select public.join_with_link($1)", [code])).rejects.toThrow(/doesn't work anymore/);

        const old = (await as(OWNER, "select public.make_invite_link($1) as code", [barId])).rows[0].code as string;
        await db.exec(`update public.invite_links set expires_at = now() - interval '1 minute' where code = '${old}'`);
        await expect(as(NEWBIE2, "select public.join_with_link($1)", [old])).rejects.toThrow(/doesn't work anymore/);
    });
});

describe("feedback", () => {
    test("anyone signed in can send it; nobody can read it from the app", async () => {
        const sent = await as(STAFF, "select public.send_feedback('idea', '  Add a par level per bottle  ', '/recipes', 'iPhone app', $1) as id", [barId]);
        expect(sent.rows[0].id).toBeTruthy();
        const row = (await db.query<Record<string, unknown>>("select user_id, email, bar_id, kind, message, page, app from public.feedback")).rows[0];
        expect(row).toEqual({ user_id: STAFF, email: "staff@bar.com", bar_id: barId, kind: "idea", message: "Add a par level per bottle", page: "/recipes", app: "iPhone app" });

        // one-way box: not even the sender, nor the owner, can read or write it directly
        expect((await as(STAFF, "select * from public.feedback").catch(() => ({ rows: "blocked" }))).rows).toBe("blocked");
        await expect(as(OWNER, "select * from public.feedback")).rejects.toThrow();
        await expect(as(OWNER, "insert into public.feedback (kind, message) values ('idea', 'x')")).rejects.toThrow();
        await expect(as(null, "select public.send_feedback('idea', 'hi')")).rejects.toThrow();
    });

    test("a place they don't belong to is dropped, and junk is refused", async () => {
        await as(STRANGER, "select public.send_feedback('problem', 'Camera won''t open', null, null, $1)", [barId]);
        const row = (await db.query<Record<string, unknown>>("select bar_id from public.feedback where user_id = $1", [STRANGER])).rows[0];
        expect(row.bar_id).toBeNull();
        await expect(as(STRANGER, "select public.send_feedback('rant', 'x')")).rejects.toThrow(/Pick idea/);
        await expect(as(STRANGER, "select public.send_feedback('idea', '   ')")).rejects.toThrow(/Write a message/);
    });

    test("20 a day per person", async () => {
        for (let i = 0; i < 19; i++) await as(STRANGER, "select public.send_feedback('other', $1)", ["note " + i]);
        await expect(as(STRANGER, "select public.send_feedback('other', 'one more')")).rejects.toThrow(/20 messages today/);
        await as(OWNER, "select public.send_feedback('other', 'still fine for someone else')");
    });
});
