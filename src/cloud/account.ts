// ===== account.ts =====
// Deleting your own account (the delete-account function does the work).
//     previewDeletion -> which places go with you and which you just leave
//     deleteAccount   -> does it, then signs this device out and clears its copy

import { supabase } from "./client";
import { signedOutAfterDeletion } from "./session";

export interface DeletionPlan {
    deleted: { barId: string; barName: string; others: number }[];
    left: { barId: string; barName: string }[];
}

async function call(confirm: boolean): Promise<{ plan: DeletionPlan } | { error: string }> {
    const { data, error } = await supabase!.functions.invoke("delete-account", { body: confirm ? { confirm: true } : {} });
    if (!error) return { plan: (data as { plan: DeletionPlan }).plan };
    try {
        const detail = await (error as { context?: Response }).context?.json();
        if (detail?.error) return { error: detail.error };
    } catch { /* not a JSON error body */ }
    return { error: "Couldn't reach Agave's server. Check your connection and try again. (" + error.message + ")" };
}

export function previewDeletion() {
    return call(false);
}

export async function deleteAccount(): Promise<string | null> {
    const reply = await call(true);
    if ("error" in reply) return reply.error;
    await signedOutAfterDeletion();
    return null;
}
