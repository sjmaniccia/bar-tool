// ===== Account.tsx =====
// Your account: who you're signed in as, and deleting the account.
// Apple requires that anyone who can make an account in the app can delete it in the app.
//
//     LOAD   what deleting would do (places you own alone go too; others you just leave)
//     ASK    type DELETE to confirm, so it can't happen by a stray tap
//     DELETE then this device is signed out and back at the sign-in screen

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { switchBar, useSession } from "../cloud/session";
import { PRIVACY_URL } from "../native";
import { deleteAccount, previewDeletion, type DeletionPlan } from "../cloud/account";
import { makeHandoffLink, setMyName } from "../cloud/team";
import { useRecipesOnly } from "../data/place";
import { setShowEverything, useSetupPrefs } from "../data/setup";
import { currentTheme, toggleTheme } from "../theme";
import { reloadNames } from "../cloud/names";
import { setCelebrations, setHaptics, setSounds, useFeedbackSettings, type Celebrations } from "../feedback";

export default function Account() {
    const session = useSession();
    const [plan, setPlan] = useState<DeletionPlan | null>(null);
    const [error, setError] = useState("");
    const [asking, setAsking] = useState(false);
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);
    const [showDelete, setShowDelete] = useState(false);     // tucked away behind a small link

    useEffect(() => {
        if (session.mode !== "ready") return;
        void previewDeletion().then((reply) => ("error" in reply ? setError(reply.error) : setPlan(reply.plan)));
    }, [session.mode]);

    if (session.mode !== "ready") {
        return (
            <div className="page page-narrow">
                <h1>Account</h1>
                <p className="muted">You're using Agave without an account, so there's nothing to delete. Your data stays on this device; clear it from <Link to="/data">Backup &amp; export</Link>.</p>
                <AppSettings />
                <SoundSettings />
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

            <YourPlaces />
            <HandOver />
            <YourName />
            <AppSettings />
            <SoundSettings />

            <p className="muted small">How Agave handles your data: <a href={PRIVACY_URL} target="_blank" rel="noreferrer">privacy policy</a>.</p>

            {/* Deleting isn't a button you stumble on: a quiet link at the very bottom opens it
                (Apple requires it to be findable in the app, so it can't be removed) */}
            {showDelete ? (
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
            ) : (
                <button className="link-button small muted delete-reveal" onClick={() => setShowDelete(true)}>Delete account…</button>
            )}
        </div>
    );
}

// Every bar and recipe book I'm in: tap one to open it, or start a new one
function YourPlaces() {
    const session = useSession();
    const navigate = useNavigate();
    const recipesOnly = useRecipesOnly();
    const label = (b: { id: string; role: string; recipeBook: boolean }) => {
        const book = b.id === session.bar?.id ? recipesOnly : b.recipeBook;
        return book ? "Recipe book · " + (b.role === "manager" ? "family" : b.role) : b.role.charAt(0).toUpperCase() + b.role.slice(1);
    };
    async function open(id: string) {
        if (id === session.bar?.id) return;
        navigate("/");
        await switchBar(id);
    }
    return (
        <section className="card">
            <h2>Your bars &amp; recipe books</h2>
            <ul className="place-list">
                {session.bars.map((b) => (
                    <li key={b.id}>
                        <button type="button" className={"place-item" + (b.id === session.bar?.id ? " current" : "")} aria-current={b.id === session.bar?.id}
                            onClick={() => void open(b.id)}>
                            <span className="place-check" aria-hidden="true">{b.id === session.bar?.id ? "✓" : ""}</span>
                            <span className="place-name">{b.name}</span>
                            <span className="muted small">{label(b)}</span>
                        </button>
                    </li>
                ))}
            </ul>
            <Link to="/places/new" className="place-new">+ New bar or recipe book</Link>
        </section>
    );
}

// Set this place up for someone else? Hand it to its real owner (owner-handoff.sql).
// The invoice copies that owners get by email link here.
//     a one-time link: they open it, sign up, and they're the owner; I become a manager
function HandOver() {
    const session = useSession();
    const recipesOnly = useRecipesOnly();
    const [link, setLink] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    if (session.mode !== "ready" || session.bar?.role !== "owner") return null;
    const name = session.bar.name;
    const what = recipesOnly ? "recipe book" : "place";

    async function make() {
        setBusy(true);
        setError("");
        const reply = await makeHandoffLink(session.bar!.id);
        if ("error" in reply) setError(reply.error);
        else setLink(reply.url);
        setBusy(false);
    }

    async function send() {
        const text = "I set up " + name + " on Agave for you. Open this to take it over as the owner: " + link;
        if (navigator.share) {
            try { await navigator.share({ text }); } catch { /* closed it */ }
        } else {
            try { await navigator.clipboard.writeText(text); setError("Copied. Paste it into a text or email."); } catch { prompt("Copy this:", text); }
        }
    }

    return (
        <section className="card">
            <h2>Hand {name} over</h2>
            <p className="muted small">
                Set this {what} up for someone else, like the owner of the bar? Send them a hand-over link. When they open it
                and sign up, they become the owner of {name}, and you stay on as a manager. Invoice copies go to them from then on.
            </p>
            {link ? (
                <>
                    <p className="handover-link small">{link}</p>
                    <div className="button-row">
                        <button onClick={() => void send()}>Text or email it</button>
                        <button className="link-button" onClick={() => void make()} disabled={busy}>New link</button>
                    </div>
                    <p className="muted small">Works once, for 7 days. A new link turns this one off.</p>
                </>
            ) : (
                <button className="secondary" onClick={() => void make()} disabled={busy}>{busy ? "Making a link…" : "Make a hand-over link"}</button>
            )}
            {error && <p className="muted small" role="status">{error}</p>}
        </section>
    );
}

// Your name: shown on recipes you add ("Added by Mom") and your versions ("(Mom's Version)")
function YourName() {
    const saved = useSession().name;
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

// Settings that used to be in the profile menu: what shows, how it looks, backups,
// and the POS (Send feedback stays in the profile menu)
function AppSettings() {
    const session = useSession();
    const recipesOnly = useRecipesOnly();
    const prefs = useSetupPrefs(session.bar?.id ?? "local");
    const [theme, setTheme] = useState(currentTheme);
    const manager = session.bar?.role !== "staff";
    return (
        <section className="card">
            <h2>Settings</h2>
            {manager && !recipesOnly && (
                <label className="menu-toggle costing-toggle">
                    <span><strong>Show everything</strong><span className="muted small">Every section, even ones you haven't set up yet.</span></span>
                    <input type="checkbox" checked={prefs.showAll} onChange={(e) => setShowEverything(e.target.checked)} />
                </label>
            )}
            <label className="menu-toggle costing-toggle">
                <span><strong>Dark mode</strong></span>
                <input type="checkbox" checked={theme === "dark"} onChange={() => setTheme(toggleTheme())} />
            </label>
            <div className="settings-links">
                {manager && <Link to="/data">Backup &amp; export</Link>}
                {manager && !recipesOnly && <Link to="/sales">Square &amp; sales</Link>}
            </div>
        </section>
    );
}

// Sounds, vibration and celebrations: on by default, switches for anyone who'd rather not
//     iPhones: sounds also stay quiet when the phone is on silent
function SoundSettings() {
    const feedback = useFeedbackSettings();
    return (
        <section className="card">
            <h2>Sounds &amp; celebrations</h2>
            <p className="muted small">The little chimes and pop-ups when something gets done. On an iPhone, sounds stay off while it's on silent.</p>
            <label className="menu-toggle costing-toggle"><span><strong>Sounds</strong></span>
                <input type="checkbox" checked={feedback.sounds} onChange={(e) => setSounds(e.target.checked)} /></label>
            <label className="menu-toggle costing-toggle"><span><strong>Vibration</strong></span>
                <input type="checkbox" checked={feedback.haptics} onChange={(e) => setHaptics(e.target.checked)} /></label>
            <label className="menu-toggle costing-toggle"><span><strong>Celebrations</strong></span>
                <select value={feedback.celebrations} onChange={(e) => setCelebrations(e.target.value as Celebrations)}>
                    <option value="full">Full</option>
                    <option value="subtle">Subtle</option>
                    <option value="off">Off</option>
                </select></label>
        </section>
    );
}
