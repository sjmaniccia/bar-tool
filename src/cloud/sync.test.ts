// ===== sync.test.ts =====
// Two devices syncing through a fake server: edits go both ways, offline edits
// survive, different rows never clash, and staff limits hold.

import { describe, expect, test } from "vitest";
import { sampleData } from "../data/sampleData";
import { emptyData } from "../data/storage";
import type { Database } from "../data/types";
import { stable, type Change, type RemoteRow, type Snapshot } from "./records";
import { SyncEngine, type DataPort, type Role, type Transport } from "./sync";

// A server that keeps rows in memory and tells subscribers about every write
class FakeServer {
    rows = new Map<string, RemoteRow & { seq: number }>();
    seq = 0;
    online = true;
    listeners: ((row: RemoteRow) => void)[] = [];

    transport(): Transport {
        return {
            fetchAll: async () => {
                if (!this.online) throw new Error("offline");
                return [...this.rows.values()].sort((a, b) => a.seq - b.seq).map((r) => structuredClone(r));
            },
            push: async (_barId: string, changes: Change[]) => {
                if (!this.online) throw new Error("offline");
                for (const c of changes) {
                    const key = c.kind + "/" + c.id;
                    const row = { kind: c.kind, id: c.id, data: c.data, deleted: c.data === null, seq: this.rows.get(key)?.seq ?? ++this.seq };
                    this.rows.set(key, row);
                    for (const listener of this.listeners) listener(structuredClone(row));
                }
            },
            subscribe: (_barId, onRow, onLive) => {
                this.listeners.push(onRow);
                onLive(true);
                return () => { this.listeners = this.listeners.filter((l) => l !== onRow); };
            }
        };
    }
}

// One device: its own data and its own saved copy
// `disk` is the device's storage, so a "reopened app" can share it
type Disk = { cache: { data: Database; base: Snapshot } | null };

function device(server: FakeServer, role: Role = "owner", disk: Disk = { cache: null }) {
    let data: Database = emptyData();
    const port: DataPort = {
        get: () => data,
        show: (next) => { data = next; },
        loadCache: () => (disk.cache ? { data: structuredClone(disk.cache.data), base: new Map(disk.cache.base) } : null),
        saveCache: (_id, d, base) => { disk.cache = { data: structuredClone(d), base: new Map(base) }; }
    };
    const engine = new SyncEngine(server.transport(), port, "bar-1", role);
    return {
        engine,
        get data() { return data; },
        set data(d: Database) { data = d; },
        // Change the data the way the app does, then send
        async edit(change: (d: Database) => void) {
            change(data);
            engine.changed();
            await engine.push();
        }
    };
}

describe("sync", () => {
    test("one device's data reaches another", async () => {
        const server = new FakeServer();
        const a = device(server);
        await a.engine.start();
        await a.edit((d) => Object.assign(d, sampleData()));
        const b = device(server);
        await b.engine.start();
        expect(stable(b.data)).toBe(stable(a.data));
        // Recipe lines keep their order
        expect(b.data.recipeLines.map((l) => l.id)).toEqual(a.data.recipeLines.map((l) => l.id));
        a.engine.stop(); b.engine.stop();
    });

    test("live edits show up on the other device, deletes too", async () => {
        const server = new FakeServer();
        const a = device(server);
        await a.engine.start();
        await a.edit((d) => Object.assign(d, sampleData()));
        const b = device(server);
        await b.engine.start();
        await a.edit((d) => { d.recipes.find((r) => r.id === "r-daiquiri")!.menuPrice = 13; });
        expect(b.data.recipes.find((r) => r.id === "r-daiquiri")!.menuPrice).toBe(13);
        await b.edit((d) => { d.wasteEntries = []; });
        expect(a.data.wasteEntries).toEqual([]);
        a.engine.stop(); b.engine.stop();
    });

    test("two people counting different products at once both keep their counts", async () => {
        const server = new FakeServer();
        const a = device(server);
        await a.engine.start();
        await a.edit((d) => Object.assign(d, sampleData()));
        const b = device(server);
        await b.engine.start();
        server.online = false;
        await a.edit((d) => { d.countLines.find((l) => l.formatId === "f-rum")!.units = 9; });
        await b.edit((d) => { d.countLines.find((l) => l.formatId === "f-tequila")!.units = 4; });
        server.online = true;
        await a.engine.refresh();
        await b.engine.refresh();
        await a.engine.refresh();
        for (const d of [a.data, b.data]) {
            expect(d.countLines.find((l) => l.formatId === "f-rum")!.units).toBe(9);
            expect(d.countLines.find((l) => l.formatId === "f-tequila")!.units).toBe(4);
        }
        a.engine.stop(); b.engine.stop();
    });

    test("edits made offline are kept on the device and sent later", async () => {
        const server = new FakeServer();
        const disk: Disk = { cache: null };
        const phone = device(server, "owner", disk);
        await phone.engine.start();
        await phone.edit((d) => Object.assign(d, sampleData()));
        // Lose the connection, keep counting, close the app
        server.online = false;
        await phone.edit((d) => { d.countLines[0].units = 7; });
        expect(phone.engine.status.state).toBe("offline");
        expect(phone.engine.status.pending).toBe(1);
        phone.engine.stop();
        // Reopen with no connection: the count is still there
        const reopened = device(server, "owner", disk);
        await reopened.engine.start();
        expect(reopened.data.countLines[0].units).toBe(7);
        reopened.engine.stop();
        // Connection back: reopening sends it, and a laptop sees it
        server.online = true;
        const online = device(server, "owner", disk);
        await online.engine.start();
        expect(online.engine.status).toMatchObject({ state: "saved", pending: 0 });
        const laptop = device(server);
        await laptop.engine.start();
        expect(laptop.data.countLines[0].units).toBe(7);
        online.engine.stop(); laptop.engine.stop();
    });

    test("staff can't change recipes, but can count", async () => {
        const server = new FakeServer();
        const owner = device(server);
        await owner.engine.start();
        await owner.edit((d) => Object.assign(d, sampleData()));
        const staff = device(server, "staff");
        await staff.engine.start();
        await staff.edit((d) => { d.recipes.find((r) => r.id === "r-daiquiri")!.menuPrice = 1; });
        expect(staff.data.recipes.find((r) => r.id === "r-daiquiri")!.menuPrice).toBe(11);   // undone
        expect(staff.engine.status.state).toBe("error");
        await staff.edit((d) => { d.countLines[0].units = 99; });
        expect(owner.data.countLines[0].units).toBe(99);
        owner.engine.stop(); staff.engine.stop();
    });
});
