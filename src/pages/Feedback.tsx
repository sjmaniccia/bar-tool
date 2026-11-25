// ===== Feedback.tsx =====
// The suggestion box. Pick idea / problem / something else, write it, send.
//     signed in      -> saved to the feedback table (only the dashboard can read it)
//     no account     -> opens an email to Agave instead
// The page they came from rides along, so "this button doesn't work" makes sense.
// In the iPhone app it also shows how to send a marked-up screenshot through TestFlight.

import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useSession } from "../cloud/session";
import { sendSuggestion, type SuggestionKind } from "../cloud/suggestions";
import { celebrate, toast } from "../feedback";
import { isNative } from "../native";

const KINDS: { kind: SuggestionKind; label: string; hint: string }[] = [
    { kind: "idea", label: "Idea", hint: "Something Agave should do, or do better." },
    { kind: "problem", label: "Problem", hint: "Something broke or didn't make sense. What did you expect to happen?" },
    { kind: "other", label: "Something else", hint: "Anything at all." }
];

const SUPPORT_EMAIL = "getagaveapp@gmail.com";

export default function Feedback() {
    const session = useSession();
    const navigate = useNavigate();
    const from = (useLocation().state as { from?: string } | null)?.from ?? "";
    const [kind, setKind] = useState<SuggestionKind>("idea");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const signedIn = session.mode === "ready";
    const hint = KINDS.find((k) => k.kind === kind)!.hint;

    async function send() {
        setBusy(true);
        setError("");
        const problem = await sendSuggestion(kind, message, from, session.bar?.id ?? null);
        setBusy(false);
        if (problem) {
            setError(problem);
            return;
        }
        celebrate("small");
        toast("Thanks! It's in the box.", { sub: "Every message gets read.", sound: "success" });
        if (from) navigate(from);
        else navigate(-1);
    }

    // No account: hand it to their email app instead
    const mailto = "mailto:" + SUPPORT_EMAIL + "?subject=" + encodeURIComponent("Agave " + KINDS.find((k) => k.kind === kind)!.label.toLowerCase())
        + "&body=" + encodeURIComponent(message);

    return (
        <div className="page page-narrow">
            <div className="page-header">
                <div>
                    <h1>Send feedback</h1>
                    <p className="muted">Ideas, problems, anything. It goes straight to the people building Agave.</p>
                </div>
            </div>

            <section className="card feedback-card">
                <div className="segmented" role="radiogroup" aria-label="What kind of feedback">
                    {KINDS.map((k) => (
                        <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind}
                            className={kind === k.kind ? "on" : ""} onClick={() => setKind(k.kind)}>
                            {k.label}
                        </button>
                    ))}
                </div>
                <label className="feedback-message">
                    <span className="muted small">{hint}</span>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} maxLength={4000}
                        placeholder={kind === "problem" ? "I tapped… and expected… but…" : "Tell us…"} aria-label="Your message" />
                </label>
                {error && <p className="error" role="alert">{error}</p>}
                <div className="button-row">
                    <button className="secondary" type="button" onClick={() => navigate(-1)} disabled={busy}>Cancel</button>
                    {signedIn ? (
                        <button type="button" onClick={() => void send()} disabled={busy || message.trim() === ""}>
                            {busy ? "Sending…" : "Send"}
                        </button>
                    ) : (
                        <a className={"button" + (message.trim() === "" ? " disabled" : "")} href={mailto}>Email it</a>
                    )}
                </div>
                {!signedIn && <p className="muted small">You're using Agave without an account, so this opens your email app, addressed to {SUPPORT_EMAIL}.</p>}
            </section>

            {isNative && (
                <section className="card testflight-tip">
                    <h2>Easier for problems: send a screenshot</h2>
                    <ol>
                        <li>On the screen with the problem, take a screenshot (side button + volume up).</li>
                        <li>Tap the little preview in the bottom-left corner.</li>
                        <li>Circle or scribble on the problem if it helps, then tap <strong>Done</strong>.</li>
                        <li>Choose <strong>Share Beta Feedback</strong>, add a note, and tap <strong>Submit</strong>.</li>
                    </ol>
                    <p className="muted small">
                        No screenshot? Open the TestFlight app, tap Agave, then <strong>Send Beta Feedback</strong>.
                        If Share Beta Feedback is missing, restart your phone and try again.
                    </p>
                </section>
            )}
        </div>
    );
}
