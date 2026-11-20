// ===== client.ts =====
// The connection to Supabase, and the Transport the sync engine uses.
//
// The project's address and publishable key come from environment variables:
//     on your computer:   .env.local          (see .env.example)
//     on GitHub Pages:    repo Settings > Secrets and variables > Actions > Variables
// The publishable key is meant to be public: Row Level Security in schema.sql
// is what protects the data, not the key.
// IF they're missing, the app runs on this device only, like before.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Change, RemoteRow } from "./records";
import type { Transport } from "./sync";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key
    ? createClient(url, key, {
        auth: {
            // PKCE puts the sign-in code in ?code=... instead of #..., which
            // would clash with the app's #/page addresses
            flowType: "pkce",
            detectSessionInUrl: true,
            persistSession: true
        }
    })
    : null;

export const cloudEnabled = supabase !== null;

const PAGE = 1000;    // the most rows Supabase returns per request
const CHUNK = 500;    // rows sent per request

export const supabaseTransport: Transport = {
    // Every live record of the bar, oldest first, a page at a time
    async fetchAll(barId) {
        const rows: RemoteRow[] = [];
        for (let from = 0; ; from += PAGE) {
            const { data, error } = await supabase!
                .from("records")
                .select("kind, id, data, deleted")
                .eq("bar_id", barId)
                .eq("deleted", false)
                .order("seq")
                .range(from, from + PAGE - 1);
            if (error) throw error;
            rows.push(...(data as RemoteRow[]));
            if (data.length < PAGE) return rows;
        }
    },

    // Insert or update each changed record; deletes are marked, not removed
    async push(barId, changes: Change[]) {
        for (let i = 0; i < changes.length; i += CHUNK) {
            const rows = changes.slice(i, i + CHUNK).map((c) => ({
                bar_id: barId, kind: c.kind, id: c.id, data: c.data, deleted: c.data === null
            }));
            const { error } = await supabase!.from("records").upsert(rows, { onConflict: "bar_id,kind,id" });
            if (error) throw error;
        }
    },

    // Live changes from other devices
    subscribe(barId, onRow, onLive) {
        const channel = supabase!
            .channel("records:" + barId)
            .on("postgres_changes", { event: "*", schema: "public", table: "records", filter: "bar_id=eq." + barId },
                (payload) => {
                    const row = payload.new as RemoteRow | undefined;
                    if (row && row.kind) onRow(row);
                })
            .subscribe((status) => onLive(status === "SUBSCRIBED"));
        return () => void supabase!.removeChannel(channel);
    }
};
