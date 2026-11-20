// ===== backup.test.ts =====
// Checks backup round-trips and the products spreadsheet import.

import { beforeEach, describe, expect, test } from "vitest";
import { db } from "./storage";
import { sampleData } from "./sampleData";
import { parseCsv } from "./csv";
import { currentPrice } from "./prices";
import { backupJson, importProductRows, productsCsv, readBackup, readProductRows, templateCsv } from "./backup";

beforeEach(() => {
    Object.assign(db, sampleData());
});

describe("backup", () => {
    test("a backup reads back with the same data", () => {
        const preview = readBackup(backupJson());
        if (typeof preview === "string") throw new Error(preview);
        expect(preview.data.recipes.length).toBe(db.recipes.length);
        expect(preview.data.wasteEntries.length).toBe(db.wasteEntries.length);
    });

    test("rejects files that aren't backups", () => {
        expect(typeof readBackup("not json")).toBe("string");
        expect(typeof readBackup('{"hello": 1}')).toBe("string");
    });
});

describe("products import", () => {
    test("the template imports cleanly into an empty bar", () => {
        Object.assign(db, { ...sampleData(), products: [], formats: [], purchaseUnits: [], priceEntries: [], vendors: [] });
        const rows = readProductRows(parseCsv(templateCsv()));
        if (typeof rows === "string") throw new Error(rows);
        expect(rows.every((r) => r.status === "new")).toBe(true);
        const result = importProductRows(rows);
        // 2 products (rum twice = one product), 2 formats, 3 ways to buy, 3 prices, 2 vendors
        expect(result).toEqual({ products: 2, formats: 2, units: 3, prices: 3, vendors: 2 });
    });

    test("re-importing the exported price list changes nothing", () => {
        const before = db.purchaseUnits.length;
        const rows = readProductRows(parseCsv(productsCsv()));
        if (typeof rows === "string") throw new Error(rows);
        expect(rows.every((r) => r.status === "update")).toBe(true);
        const result = importProductRows(rows);
        expect(result.products + result.formats + result.units + result.prices).toBe(0);
        expect(db.purchaseUnits.length).toBe(before);
    });

    test("a changed price is recorded as a new price", () => {
        const csv = "Name,Size,Unit,Vendor,Buy as,Units per,Price\nIsland White Rum,1000,ml,Southern Glazer's,case,12,222";
        const rows = readProductRows(parseCsv(csv));
        if (typeof rows === "string") throw new Error(rows);
        expect(rows[0].status).toBe("update");
        importProductRows(rows);
        const unit = db.purchaseUnits.find((u) => u.formatId === "f-rum" && u.unitAmount === 12)!;
        expect(currentPrice(unit.id)).toBe(222);
    });

    test("bad rows are flagged and skipped", () => {
        const rows = readProductRows(parseCsv("Name,Size,Unit\n,750,ml\nGin,big,ml\nGin,750,gallonz"));
        if (typeof rows === "string") throw new Error(rows);
        expect(rows.map((r) => r.status)).toEqual(["error", "error", "error"]);
    });
});
