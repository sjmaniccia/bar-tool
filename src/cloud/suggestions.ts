// ===== suggestions.ts =====
// The suggestion box: send an idea or a problem to Agave.
//     sendSuggestion  -> null when it's in, or a message saying what went wrong
// The send-feedback function saves it (supabase/feedback.sql) and emails it to Agave.
// Who's sending is filled in by the database, never by the app.

import { supabase } from "./client";
import { isNative } from "../native";

export type SuggestionKind = "idea" | "problem" | "other";

export async function sendSuggestion(kind: SuggestionKind, message: string, page: string, barId: string | null): Promise<string | null> {
    const { error } = await supabase!.functions.invoke("send-feedback", {
        body: { kind, message, page, barId, app: (isNative ? "iPhone app" : "Website") + " · " + navigator.userAgent.slice(0, 60) }
    });
    if (!error) return null;
    try {
        const detail = await (error as { context?: Response }).context?.json();
        if (detail?.error) return detail.error;
    } catch { /* not a JSON error body */ }
    return "No connection right now. Your message is still here; try again in a moment.";
}
