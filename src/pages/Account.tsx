// ===== Account.tsx =====
// Your account: who you're signed in as, and deleting the account.
// Apple requires that anyone who can make an account in the app can delete it in the app.
//
//     LOAD   what deleting would do (places you own alone go too; others you just leave)
//     ASK    type DELETE to confirm, so it can't happen by a stray tap
//     DELETE then this device is signed out and back at the sign-in screen

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useSession } from "../cloud/session";
import { PRIVACY_URL } from "../native";
import { deleteAccount, previewDeletion, type DeletionPlan } from "../cloud/account";
import { setMyName } from "../cloud/team";
import { reloadNames, useMyName } from "../cloud/names";

export default function Account() {
    const session = useSession();
    const [plan, setPlan] = useState<DeletionPlan | null>(null);
    const [error, setError] = useState("");
    const [asking, setAsking] = useState(false);
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (session.mode !== "ready") return;
        void previewDeletion().then((reply) => ("error" in reply ? setError(reply.error) : setPlan(reply.plan)));
    }, [session.mode]);

    if (session.mode !== "ready") {
        return (
            <div className="page page-narrow">
                <h1>Account</h1>
                <p className="muted">You're using Agave without an account, so there's nothing to delete. Your data stays on this device; clear it from <Link to="/data">Backup &amp; export</Link>.</p>
            </div>
        );
    }

    async function confirmDelete() {
        setBusy(true);
        setError("");
        const problem = await deleteAccount();
        setBusy(false);
        if (problem) setError(problem);
    }

    return (
        <div className="page page-narrow">
            <div className="page-header">
                <div>
                    <h1>Account</h1>
                    <p className="muted">Signed in as {session.email}</p>
                </div>
            </div>

            <YourName />

            <p className="muted small">How Agave handles your data: <a href={PRIVACY_URL} target="_blank" rel="noreferrer">privacy policy</a>.</p>

            <section className="card danger-card">
                <h2>Delete your account</h2>
                <p>This deletes your sign-in for good. It can't be undone.</p>
                {plan === null && !error && <p className="muted small">Checking your places…</p>}
                {plan && plan.deleted.length > 0 && (
                    <>
                        <p><strong>These places will be deleted too</strong>, with all their recipes, products, counts and invoices, because you're their only owner:</p>
                        <ul className="plain-list">
                            {plan.deleted.map((p) => (
                                <li key={p.barId}>
                                    <strong>{p.barName}</strong>
                                    {p.others > 0 && <span className="warn small"> · {p.others} {p.others === 1 ? "person loses" : "people lose"} access</span>}
                                </li>
                            ))}
                        </ul>
                        <p className="muted small">
                            Want a place to live on without you? Make someone else an owner on the <Link to="/team">Team</Link> page first.
                            Want a copy of its data? Download one from <Link to="/data">Backup &amp; export</Link>.
                        </p>
                    </>
                )}
                {plan && plan.left.length > 0 && (
                    <p className="muted small">You'll leave {plan.left.map((p) => p.barName).join(", ")}. {plan.left.length === 1 ? "It stays" : "They stay"} as they are for everyone else.</p>
                )}
                {error && <p className="error" role="alert">{error}</p>}

                {!asking ? (
                    <button className="danger" onClick={() => setAsking(true)} disabled={plan === null}>Delete my account…</button>
                ) : (
                    <div className="delete-confirm">
                        <label>
                            Type <strong>DELETE</strong> to confirm
                            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" aria-label="Type DELETE to confirm" />
                        </label>
                        <div className="button-row">
                            <button className="secondary" onClick={() => { setAsking(false); setTyped(""); }} disabled={busy}>Cancel</button>
                            <button className="danger solid" onClick={() => void confirmDelete()} disabled={typed.trim().toUpperCase() !== "DELETE" || busy}>
                                {busy ? "Deleting…" : "Delete forever"}
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

// Your name: shown on recipes you add ("Added by Mom") and your versions ("(Mom's Version)")
function YourName() {
    const saved = useMyName();
    const [name, setName] = useState<string | null>(null);     // null = not edited yet
    const [note, setNote] = useState("");
    const shown = name ?? saved;

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const problem = await setMyName(shown);
        setNote(problem ?? "Saved.");
        if (!problem) {
            setName(null);
            reloadNames();
        }
    }

    return (
        <section className="card">
            <h2>Your name</h2>
            <p className="muted small">Shown on recipes you add, like "Added by Mom", and on your versions of others' recipes.</p>
            <form className="button-row" onSubmit={save}>
                <input value={shown} maxLength={60} placeholder="Mom, Sarah, Uncle Joe" aria-label="Your name"
                    onChange={(e) => { setName(e.target.value); setNote(""); }} />
                <button type="submit" disabled={name === null || name.trim() === saved}>Save</button>
            </form>
            {note && <p className="muted small" role="status">{note}</p>}
        </section>
    );
}
