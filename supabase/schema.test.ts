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
