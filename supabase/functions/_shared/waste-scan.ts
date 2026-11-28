// ===== waste-scan.ts =====
// What Claude is asked to pull off a paper waste log (the sheet by the well where
// bartenders write down spills and comps), and the clean-up after.
// No network in here, so the app's tests can check it.
//
// Each written line becomes a row: date, what, how many, reason, note.
//     amounts become numbers ("1/2" -> 0.5, "half" -> 0.5)
//     reasons become one of Agave's: spill, comp, returned, breakage, expired, other
//     "comped", "on the house", "birthday shot" -> comp; "dropped", "broke" -> breakage;
//     "sent back", "remake", "wrong order" -> returned; "bad", "spoiled", "old" -> expired
//     blank and crossed-out lines are dropped

export type WasteReason = "spill" | "comp" | "returned" | "breakage" | "expired" | "other";
const REASONS: WasteReason[] = ["spill", "comp", "returned", "breakage", "expired", "other"];

export interface ScannedWaste {
    date: string;          // YYYY-MM-DD, or "" if the line and the sheet have none
    item: string;          // as written: "Tito's", "marg", "lime juice"
    quantity: number;      // how many of `unit`
    unit: string;          // as written, singular: "bottle", "oz", "drink", "shot", "" for none
    reason: WasteReason;
    note: string;          // anything else written: initials, "table 12", "birthday"
}

export const WASTE_TOOL = {
    name: "record_waste",
    description: "Record every line written on the waste log, exactly as written.",
    input_schema: {
        type: "object",
        properties: {
            sheet_date: { type: "string", description: "A date written at the top of the sheet, as YYYY-MM-DD. Empty if none." },
            lines: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        date: { type: "string", description: "This line's date as YYYY-MM-DD, if it has one. Empty if not." },
                        item: { type: "string", description: "What was wasted, as written (a drink, a product, an ingredient)." },
                        quantity: { type: "string", description: "How many or how much, as written: '1', '1/2', '2', 'half'." },
                        unit: { type: "string", description: "The unit written with the amount, singular: 'bottle', 'oz', 'drink', 'shot', 'case'. Empty if none." },
                        reason: { type: "string", enum: REASONS, description: "spill, comp (comped/on the house/birthday), returned (sent back/remake/wrong), breakage (dropped/broke), expired (spoiled/old/bad), or other." },
                        note: { type: "string", description: "Anything else on the line: initials, table, who it was for. Empty if nothing." }
                    },
                    required: ["item", "quantity", "reason"]
                }
            }
        },
        required: ["lines"]
    }
};

export const WASTE_INSTRUCTIONS = [
    "This is a photo of a bar or restaurant's waste log: handwritten or printed lines recording spills, comps, breakage and sent-back drinks.",
    "Record every line with something written on it, top to bottom. Skip blank, crossed-out and header lines.",
    "Copy the item name as written; don't correct or expand abbreviations. Use the reason that fits best.",
    "Dates: use the line's date if it has one, otherwise leave it empty; put a date written at the top of the sheet in sheet_date.",
    "Write dates as YYYY-MM-DD. If the year isn't written, use the most recent past date that fits."
].join(" ");

// "1 1/2" -> 1.5, "½" -> 0.5, "half" -> 0.5, "2x" -> 2
export function wasteAmount(text: string): number {
    const t = text.toLowerCase().replace(/[x×]/g, "").replace("½", " 1/2").replace("¼", " 1/4").replace("¾", " 3/4").trim();
    if (t === "half" || t === "a half") return 0.5;
    if (t === "" || t === "a" || t === "an" || t === "one") return 1;
    let total = 0;
    for (const part of t.split(/\s+/)) {
        const frac = part.match(/^(\d+)\/(\d+)$/);
        if (frac) total += Number(frac[1]) / Number(frac[2]);
        else if (!isNaN(Number(part))) total += Number(part);
    }
    return total > 0 ? Math.round(total * 1000) / 1000 : 1;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function cleanWaste(input: unknown): { lines: ScannedWaste[]; warnings: string[] } {
    const raw = (input ?? {}) as { sheet_date?: string; lines?: Record<string, unknown>[] };
    const sheetDate = DATE.test(String(raw.sheet_date ?? "")) ? String(raw.sheet_date) : "";
    const warnings: string[] = [];
    const lines: ScannedWaste[] = [];
    for (const line of Array.isArray(raw.lines) ? raw.lines : []) {
        const item = String(line.item ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
        if (item === "") continue;
        const date = DATE.test(String(line.date ?? "")) ? String(line.date) : sheetDate;
        const reason = REASONS.includes(line.reason as WasteReason) ? (line.reason as WasteReason) : "other";
        lines.push({
            date,
            item,
            quantity: wasteAmount(String(line.quantity ?? "1")),
            unit: String(line.unit ?? "").trim().toLowerCase().replace(/s$/, "").slice(0, 30),
            reason,
            note: String(line.note ?? "").replace(/\s+/g, " ").trim().slice(0, 200)
        });
    }
    if (lines.length === 0) warnings.push("No waste lines were found on this page.");
    return { lines, warnings };
}
