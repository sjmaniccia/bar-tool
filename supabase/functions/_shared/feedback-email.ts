// ===== feedback-email.ts =====
// Turns one suggestion-box message into the email that lands in Agave's inbox.
// Kept apart from the function so it can be tested without sending anything.
//
//     SUBJECT  "[Agave problem] The scan button is hard to find…" (kind + start of message)
//     BODY     the message, then who / which place / which page / app or website
//     REPLY    goes to the person who sent it, so answering is just hitting Reply

export interface FeedbackDetails {
    kind: string;
    message: string;
    email: string;
    placeName: string;
    page: string;
    app: string;
}

const KIND_LABEL: Record<string, string> = { idea: "idea", problem: "problem", other: "feedback" };

export function feedbackEmail(f: FeedbackDetails) {
    const message = f.message.trim();
    const firstLine = message.split("\n")[0];
    const start = firstLine.length > 60 ? firstLine.slice(0, 57).trimEnd() + "…" : firstLine;
    const subject = "[Agave " + (KIND_LABEL[f.kind] ?? "feedback") + "] " + start;
    const text = [
        message,
        "",
        "—",
        "From: " + (f.email || "unknown"),
        "Place: " + (f.placeName || "none"),
        "Page: " + (f.page || "unknown"),
        "Using: " + (f.app || "unknown"),
        "",
        "Hit Reply to answer them."
    ].join("\n");
    return { subject, text, replyTo: f.email || undefined };
}
