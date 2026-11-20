// ===== records.ts =====
// The math of syncing, with no network in it (so it can be tested).
//
// Every row of every table becomes one "record", keyed "kind/id":
//     "recipes/3f2a..."  ->  '{"id":"3f2a...","name":"Daiquiri",...}'
//
// A SNAPSHOT is every record as text. Comparing two snapshots shows what changed.
// The sync keeps one snapshot called BASE: what the server has, as far as we know.
//     pending changes = diff(base, what's on screen now)
//
// Conflicts: each record syncs on its own, so two people editing different
// rows never clash. If two people edit the SAME row, the last one saved wins.

import { emptyData, loadData } from "../data/storage";
import type { Database } from "../data/types";

export type Kind = keyof Database;
export const KINDS = Object.keys(emptyData()) as Kind[];

export type Snapshot = Map<string, string>;

// One change to send: data = the new row, or null if it was deleted
export interface Change {
    kind: Kind;
    id: string;
    data: Record<string, unknown> | null;
}

// One record as the server sends it
export interface RemoteRow {
    kind: string;
    id: string;
    data: Record<string, unknown> | null;
    deleted: boolean;
}

export function recordKey(kind: string, id: string): string {
    return kind + "/" + id;
}

// JSON with the keys always in the same order.
// The database stores JSON with its keys reordered, so plain JSON.stringify
// would make a row look changed when it isn't.
export function stable(value: unknown): string {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (value !== null && typeof value === "object") {
        const entries = Object.keys(value as object).sort()
            .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
            .map((k) => JSON.stringify(k) + ":" + stable((value as Record<string, unknown>)[k]));
        return "{" + entries.join(",") + "}";
    }
    return JSON.stringify(value);
}

// Every row of the data as text, in table order then row order
export function snapshot(data: Database): Snapshot {
    const snap: Snapshot = new Map();
    for (const kind of KINDS) {
        for (const row of data[kind] as { id: string }[]) {
            snap.set(recordKey(kind, row.id), stable(row));
        }
    }
    return snap;
}

// Turn a snapshot back into tables (rows keep the snapshot's order),
// then run the usual upgrades so old rows get any new fields
export function fromSnapshot(snap: Snapshot): Database {
    const tables: Record<string, unknown[]> = {};
    for (const kind of KINDS) tables[kind] = [];
    for (const [key, json] of snap) {
        const kind = key.slice(0, key.indexOf("/"));
        if (kind in tables) tables[kind].push(JSON.parse(json));
    }
    return loadData(JSON.stringify(tables));
}

// What changed from `base` to `current`
//     FOR each record now: IF it's new or different -> send it
//     FOR each record in base that's gone now -> send a delete
export function diff(base: Snapshot, current: Snapshot): Change[] {
    const changes: Change[] = [];
    for (const [key, json] of current) {
        if (base.get(key) !== json) changes.push(toChange(key, JSON.parse(json)));
    }
    for (const key of base.keys()) {
        if (!current.has(key)) changes.push(toChange(key, null));
    }
    return changes;
}

function toChange(key: string, data: Record<string, unknown> | null): Change {
    const slash = key.indexOf("/");
    return { kind: key.slice(0, slash) as Kind, id: key.slice(slash + 1), data };
}

// The server's rows as a snapshot (skipping deleted ones and tables this app doesn't know)
export function snapshotOfRows(rows: RemoteRow[]): Snapshot {
    const snap: Snapshot = new Map();
    for (const row of rows) {
        if (row.deleted || row.data === null || !(KINDS as string[]).includes(row.kind)) continue;
        snap.set(recordKey(row.kind, row.id), stable(row.data));
    }
    return snap;
}

// Start from the server's copy, then put this device's unsent changes on top.
// Used when opening the app, and when coming back online.
//     pending = what this device changed since it last heard from the server
//     result  = server rows, with pending changes applied (new rows go at the end)
export function rebase(local: Database, oldBase: Snapshot, serverRows: RemoteRow[]): { data: Database; base: Snapshot } {
    const pending = diff(oldBase, snapshot(local));
    const base = snapshotOfRows(serverRows);
    const merged: Snapshot = new Map(base);
    for (const change of pending) {
        const key = recordKey(change.kind, change.id);
        if (change.data === null) merged.delete(key);
        else merged.set(key, stable(change.data));
    }
    return { data: fromSnapshot(merged), base };
}

// Another device changed a record: apply it here
//     IF this device has its own unsent change to the same row, keep ours
//         (it gets sent next and wins, since it's newer)
//     ELSE take theirs
//     Returns true if the data on screen changed
export function applyRemote(data: Database, base: Snapshot, row: RemoteRow): boolean {
    if (!(KINDS as string[]).includes(row.kind)) return false;
    const kind = row.kind as Kind;
    const key = recordKey(kind, row.id);
    const remote = row.deleted || row.data === null ? null : stable(row.data);
    const table = data[kind] as { id: string }[];
    const index = table.findIndex((r) => r.id === row.id);
    const mine = index === -1 ? null : stable(table[index]);
    const known = base.get(key) ?? null;

    if (remote === null) base.delete(key);
    else base.set(key, remote);

    if (mine !== known) return false;   // unsent change here: keep it
    if (mine === remote) return false;  // already the same (our own change coming back)
    if (remote === null) table.splice(index, 1);
    else if (index === -1) table.push(JSON.parse(remote));
    else table[index] = JSON.parse(remote);
    return true;
}

// Undo changes that can't be sent (e.g. staff editing a recipe): put back the server's version
export function revert(data: Database, base: Snapshot, changes: Change[]) {
    for (const change of changes) {
        const table = data[change.kind] as { id: string }[];
        const index = table.findIndex((r) => r.id === change.id);
        const known = base.get(recordKey(change.kind, change.id));
        if (known === undefined) {
            if (index !== -1) table.splice(index, 1);
        } else if (index === -1) {
            table.push(JSON.parse(known));
        } else {
            table[index] = JSON.parse(known);
        }
    }
}
