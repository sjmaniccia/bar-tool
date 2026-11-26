// ===== sync.ts =====
// Keeps one bar's data in step between this device and the server.
//
//     OPEN      show the copy saved on this device right away (works offline),
//               then fetch the server's copy and put any unsent changes on top
//     EDIT      every commit() saves a local copy, then sends the changes a moment
//               later (typing a price doesn't send one request per keystroke)
//     LIVE      another device's changes arrive over a live connection and show up
//     OFFLINE   changes wait on this device; when the connection is back, they're sent
//
// The network part is a Transport, so tests can swap in a fake server.

import type { Database } from "../data/types";
import { applyRemote, diff, rebase, recordKey, revert, snapshot, stable, type Change, type RemoteRow, type Snapshot } from "./records";
import { familyBlocked } from "./familyRules";
import { isRecipesOnly } from "../data/place";

export type Role = "owner" | "manager" | "staff";

export interface Transport {
    fetchAll(barId: string): Promise<RemoteRow[]>;
    push(barId: string, changes: Change[]): Promise<void>;
    // Calls onRow for each change from the server. onLive(true) when connected.
    // Returns a function that disconnects.
    subscribe(barId: string, onRow: (row: RemoteRow) => void, onLive: (live: boolean) => void): () => void;
}

// What the app shows the person about syncing
export interface SyncStatus {
    state: "loading" | "saved" | "saving" | "offline" | "error";
    pending: number;      // changes not on the server yet
    message: string;
}

// How the engine reads and shows the app's data (storage.ts in the app, plain objects in tests)
export interface DataPort {
    get(): Database;
    show(data: Database): void;                                   // swap in new data and redraw
    loadCache(barId: string): { data: Database; base: Snapshot } | null;
    saveCache(barId: string, data: Database, base: Snapshot): void;
}

// Staff can only change counting and waste (the database enforces this too)
const STAFF_KINDS = new Set(["stockCounts", "countLines", "wasteEntries"]);
const PUSH_DELAY = 700;      // ms to wait after the last edit before sending
const RETRY_DELAY = 15000;   // ms between tries while offline

export class SyncEngine {
    private base: Snapshot = new Map();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private pushing = false;
    private again = false;
    private stopped = false;
    private unsubscribe: (() => void) | null = null;
    private wasLive = false;
    status: SyncStatus = { state: "loading", pending: 0, message: "" };
    onStatus: (status: SyncStatus) => void = () => {};

    constructor(
        private transport: Transport,
        private port: DataPort,
        readonly barId: string,
        readonly role: Role,
        readonly userId = ""
    ) {}

    // Open the bar: cached copy first, then the server's
    async start() {
        const cached = this.port.loadCache(this.barId);
        if (cached !== null) {
            this.base = cached.base;
            this.port.show(cached.data);
        }
        this.unsubscribe = this.transport.subscribe(this.barId, (row) => this.receive(row), (live) => {
            // WHEN the live connection comes back after a drop, catch up on what was missed
            if (live && this.wasLive === false && this.status.state !== "loading") void this.refresh();
            this.wasLive = live;
        });
        await this.refresh();
    }

    stop() {
        this.stopped = true;
        this.unsubscribe?.();
        if (this.timer !== null) clearTimeout(this.timer);
    }

    // Fetch everything from the server and put this device's unsent changes on top
    async refresh() {
        try {
            const rows = await this.transport.fetchAll(this.barId);
            if (this.stopped) return;
            const result = rebase(this.port.get(), this.base, rows);
            this.base = result.base;
            this.port.show(result.data);
            this.port.saveCache(this.barId, result.data, this.base);
            await this.push();
        } catch (error) {
            this.setStatus("offline", "Working offline. Changes are saved on this device.", error);
            this.retryLater();
        }
    }

    // Called after every commit(): save here now, send soon
    changed() {
        this.port.saveCache(this.barId, this.port.get(), this.base);
        this.setStatus("saving", "");
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.push(), PUSH_DELAY);
    }

    // Send everything that's different from the server
    //     IF already sending, send again when that finishes
    //     Staff changes outside counting/waste are undone (they'd be refused anyway)
    async push(): Promise<void> {
        if (this.stopped) return;
        if (this.pushing) {
            this.again = true;
            return;
        }
        this.pushing = true;
        try {
            let changes = diff(this.base, snapshot(this.port.get()));
            let notice = "";
            if (this.role === "staff") {
                const blocked = changes.filter((c) => !STAFF_KINDS.has(c.kind));
                if (blocked.length > 0) {
                    const data = this.port.get();
                    revert(data, this.base, blocked);
                    this.port.show(data);
                    changes = changes.filter((c) => STAFF_KINDS.has(c.kind));
                    notice = "Staff accounts can only change counts and the waste log, so other changes were undone.";
                }
            }
            // Just recipes: family change only their own recipes (familyRules.ts)
            if (this.role === "manager" && isRecipesOnly(this.port.get())) {
                const blocked = familyBlocked(changes, this.port.get(), this.base, this.userId);
                if (blocked.length > 0) {
                    const data = this.port.get();
                    revert(data, this.base, blocked);
                    this.port.show(data);
                    changes = changes.filter((c) => !blocked.includes(c));
                    notice = "You can only change recipes you added, so other changes were undone. Make your own version instead.";
                }
            }
            if (changes.length === 0) {
                this.setStatus(notice ? "error" : "saved", notice);
                return;
            }
            this.setStatus("saving", "", undefined, changes.length);
            await this.transport.push(this.barId, changes);
            // Sent: the server now has these versions
            for (const change of changes) {
                const key = recordKey(change.kind, change.id);
                if (change.data === null) this.base.delete(key);
                else this.base.set(key, stable(change.data));
            }
            this.port.saveCache(this.barId, this.port.get(), this.base);
            this.setStatus(notice ? "error" : "saved", notice);
        } catch (error) {
            this.setStatus("offline", "Couldn't reach the server. Changes are saved on this device and will be sent.", error);
            this.retryLater();
        } finally {
            this.pushing = false;
            if (this.again) {
                this.again = false;
                await this.push();
            }
        }
    }

    // Another device changed something
    private receive(row: RemoteRow) {
        const data = this.port.get();
        if (applyRemote(data, this.base, row)) this.port.show(data);
        this.port.saveCache(this.barId, data, this.base);
    }

    private retryLater() {
        if (this.stopped) return;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.refresh(), RETRY_DELAY);
    }

    private setStatus(state: SyncStatus["state"], message: string, error?: unknown, sending?: number) {
        if (error !== undefined) console.log("Sync:", error);
        const pending = sending ?? diff(this.base, snapshot(this.port.get())).length;
        this.status = { state, pending, message };
        this.onStatus(this.status);
    }
}
