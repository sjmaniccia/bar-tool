// ===== invoiceCopy.ts =====
// After a scanned invoice is saved: a copy (details + the photos) goes to the place's
// owners by email (supabase/functions/invoice-copy). Quietly, in the background: if it
// can't go out, the invoice is saved all the same.

import { supabase } from "./client";
import type { ScanPage } from "./scan";
import { draftTotals, lineAmount, type Draft } from "../data/invoiceScan";
import { db } from "../data/storage";
import { findById } from "../data/utils";

export async function sendInvoiceCopy(barId: string, draft: Draft, photos: ScanPage[]): Promise<number> {
    if (!supabase) return 0;
    const totals = draftTotals(draft);
    // Every line as printed (a copy of the paper), matched to a product or not; fees separately
    const lines = draft.lines.filter((l) => l.use !== "charge");
    const charges = [
        ...draft.lines.filter((l) => l.use === "charge").map((l) => ({ name: l.scanned.description, amount: lineAmount(l) })),
        ...draft.extraCharges.map((c) => ({ name: c.description || "Charge", amount: c.amount })),
        ...(totals.tax ? [{ name: "Tax", amount: totals.tax }] : [])
    ];
    const invoice = {
        vendor: findById(db.vendors, draft.vendorId)?.companyName ?? draft.vendorName,
        number: draft.number,
        date: draft.date,
        lines: lines.map((l) => ({ name: l.scanned.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: lineAmount(l) })),
        charges,
        total: draft.total ?? totals.entered
    };
    try {
        const { data } = await supabase.functions.invoke("invoice-copy", { body: { barId, invoice, photos } });
        return Number((data as { emailed?: number } | null)?.emailed ?? 0);
    } catch {
        return 0;
    }
}
