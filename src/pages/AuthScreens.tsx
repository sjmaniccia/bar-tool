// ===== AuthScreens.tsx =====
// The screens before the app: sign in, create an account, reset a password,
// and set up a bar. They share one centered card with the Agave seal.

import { isNative, PRIVACY_URL } from "../native";

// iPhones and iPads (iPadOS says "Macintosh" but has a touch screen)
const onIPhone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
    clearNotice, createBar, hasDeviceData, pendingJoinCode, sendPasswordReset, setNewPassword, signIn, signOut, signUp,
    startDemo, useSession, type StartWith
} from "../cloud/session";
import { appJoinUrl, peekInviteLink, setMyName } from "../cloud/team";
import { reloadNames } from "../cloud/names";
import { supabase } from "../cloud/client";
import { BrandMark } from "../components/BrandMark";

// The card every screen sits in
//     a one-time notice (like "that link didn't work") shows at the top until dismissed
function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
    const { notice } = useSession();
    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-brand"><BrandMark />Agave</div>
                {notice && (
                    <div className="auth-notice" role="status">
                        <span>{notice}</span>
                        <button type="button" className="link-button" aria-label="Dismiss" onClick={clearNotice}>×</button>
                    </div>
                )}
                <h1>{title}</h1>
                {subtitle && <p className="muted">{subtitle}</p>}
                {children}
            </div>
            <p className="auth-foot muted small">Recipe costing, inventory and ordering for bars, kitchens and breweries.</p>
        </div>
    );
}

export function LoadingScreen() {
    return (
        <div className="auth-page">
            <div className="auth-loading"><BrandMark /><span className="muted">Opening Agave…</span></div>
        </div>
    );
}


// ===== Sign in / create account / forgot password =====

type Tab = "in" | "up" | "forgot";

export function SignInScreen() {
    // Came from an invite link? Say which bar, and start on "Create account"
    const joinCode = pendingJoinCode();
    const [joining, setJoining] = useState<{ barName: string; role: string; recipeBook: boolean } | null | "bad">(null);
    useEffect(() => {
        if (!joinCode) return;
        void peekInviteLink(joinCode).then((info) => setJoining(info ?? "bad"));
    }, [joinCode]);
    const [tab, setTab] = useState<Tab>(joinCode ? "up" : "in");
    const [name, setName] = useState("");          // Create account: what others see ("Added by Mom")
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [sent, setSent] = useState("");          // "Check your email" message
    const [busy, setBusy] = useState(false);

    // WHEN the form is sent: run the action for the open tab, show what happened
    async function submit(event: FormEvent) {
        event.preventDefault();
        setError("");
        setBusy(true);
        if (tab === "in") {
            const result = await signIn(email, password);
            if (result) setError(result);
        } else if (tab === "up") {
            if (name.trim() === "") {
                setBusy(false);
                return setError("Add your name, so others know which recipes and versions are yours.");
            }
            if (password.length < 8) {
                setBusy(false);
                return setError("Use a password of at least 8 characters.");
            }
            const result = await signUp(email, password, name);
            if (result === "confirm") setSent("We sent a link to " + email.trim() + ". Click it to finish making your account, then sign in.");
            else if (result) setError(result);
        } else {
            const result = await sendPasswordReset(email);
            if (result) setError(result);
            else setSent("If " + email.trim() + " has an account, a reset link is on its way.");
        }
        setBusy(false);
    }

    function switchTab(next: Tab) {
        setTab(next);
        setError("");
        setSent("");
    }

    if (sent) {
        return (
            <AuthCard title="Check your email" subtitle={sent}>
                <p className="muted small">No email after a few minutes? Check spam, or try again.</p>
                <button className="secondary" onClick={() => switchTab("in")}>Back to sign in</button>
            </AuthCard>
        );
    }

    const titles: Record<Tab, string> = { in: "Sign in", up: "Create your account", forgot: "Reset your password" };
    return (
        <AuthCard title={titles[tab]} subtitle={tab === "forgot" ? "We'll email you a link to set a new one." : undefined}>
            {joining && joining !== "bad" && (
                <div className="auth-joining" role="status">
                    {joining.role === "owner"
                        ? <>You're taking over <strong>{joining.barName}</strong> as its owner.</>
                        : joining.recipeBook
                        ? <>You're joining the <strong>{joining.barName}</strong> recipe book.</>
                        : <>You're joining <strong>{joining.barName}</strong> as {joining.role === "manager" ? "a manager" : "staff"}.</>}
                    {tab === "up" ? " Make an account to get in." : " Sign in to get in."}
                    {onIPhone && !isNative && joinCode && (
                        <a className="button secondary app-open" href={appJoinUrl(joinCode)}>Have the app? Open it there</a>
                    )}
                </div>
            )}
            {joining === "bad" && <p className="error" role="alert">That invite link doesn't work anymore. Ask for a new one.</p>}
            {tab !== "forgot" && (
                <div className="tab-row auth-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === "in"} className={"tab" + (tab === "in" ? " active" : "")} onClick={() => switchTab("in")}>Sign in</button>
                    <button type="button" role="tab" aria-selected={tab === "up"} className={"tab" + (tab === "up" ? " active" : "")} onClick={() => switchTab("up")}>Create account</button>
                </div>
            )}
            <form className="auth-form" onSubmit={submit}>
                {tab === "up" && (
                    <label className="form-field">
                        <span>Your name</span>
                        <input autoComplete="given-name" required maxLength={60} value={name} placeholder="What your family or team calls you"
                            onChange={(e) => setName(e.target.value)} />
                    </label>
                )}
                <label className="form-field">
                    <span>Email</span>
                    <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                {tab !== "forgot" && (
                    <label className="form-field">
                        <span>Password</span>
                        <input type="password" required minLength={tab === "up" ? 8 : undefined}
                            autoComplete={tab === "up" ? "new-password" : "current-password"}
                            value={password} onChange={(e) => setPassword(e.target.value)} />
                    </label>
                )}
                {error && <p className="error" role="alert">{error}</p>}
                <button type="submit" disabled={busy}>
                    {busy ? "One moment…" : tab === "in" ? "Sign in" : tab === "up" ? "Create account" : "Send reset link"}
                </button>
            </form>
            <div className="auth-links">
                {tab === "in" && <button className="link-button" onClick={() => switchTab("forgot")}>Forgot your password?</button>}
                {tab === "forgot" && <button className="link-button" onClick={() => switchTab("in")}>Back to sign in</button>}
            </div>
            {!joinCode && (
                <div className="auth-demo">
                    <span className="muted small">Just looking?</span>
                    <button className="secondary" onClick={startDemo}>Try it without an account</button>
                </div>
            )}
            <p className="muted small auth-legal"><a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy policy</a></p>
        </AuthCard>
    );
}


// ===== Coming back from a reset-password email =====

export function NewPasswordScreen() {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (password.length < 8) return setError("Use a password of at least 8 characters.");
        const result = await setNewPassword(password);
        if (result) setError(result);
    }

    return (
        <AuthCard title="Set a new password">
            <form className="auth-form" onSubmit={submit}>
                <label className="form-field">
                    <span>New password</span>
                    <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                {error && <p className="error" role="alert">{error}</p>}
                <button type="submit">Save password</button>
            </form>
        </AuthCard>
    );
}


// ===== Signed in, but not in a bar yet =====

// The form for a new place: what it's for, its name, what it starts with
//     used here (first place) and on "Start a new place" (another one)
//     A bar/restaurant/brewery -> costing, stock, sales; can start with sample data
//     A recipe book            -> just recipes (family or personal); starts empty
export function PlaceSetupForm({ onCancel, onDone }: { onCancel?: () => void; onDone?: () => void }) {
    const deviceHasData = hasDeviceData() && !onCancel;    // only offered for a first place
    const session = useSession();
    const askName = session.name === "";                    // accounts made before names were asked
    const [myName, setMyNameText] = useState("");
    const [kind, setKind] = useState<"business" | "family">("business");
    const [name, setName] = useState("");
    const [start, setStart] = useState<StartWith>(deviceHasData ? "device" : "empty");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const family = kind === "family";

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (name.trim() === "") return setError(family ? "Give your recipe book a name." : "Give your place a name.");
        if (askName && family && myName.trim() === "") return setError("Add your name, so everyone knows which recipes are yours.");
        setBusy(true);
        const result = await createBar(name, family ? "empty" : start, family);
        if (result) {
            setError(result);
            setBusy(false);
        } else {
            if (askName && myName.trim() && (await setMyName(myName)) === null) reloadNames();
            onDone?.();
        }
    }

    const kinds = [
        { value: "business" as const, label: "A bar, restaurant or brewery", note: "Recipes with costs, menus, stock counts, invoices and sales." },
        { value: "family" as const, label: "A recipe book", note: "Family or personal recipes: scan them, share them, cook from them. No costs." }
    ];
    const options: { value: StartWith; label: string; note: string; show: boolean }[] = [
        { value: "device", label: "What I set up on this device", note: "Bring along the recipes and products you made before signing up.", show: deviceHasData },
        { value: "empty", label: "Nothing", note: "Start fresh, or import a price list from Backup & export.", show: true },
        { value: "sample", label: "Sample recipes and data", note: "Example recipes, counts and invoices to explore. You can clear them later.", show: true }
    ];

    return (
        <form className="auth-form" onSubmit={submit}>
            <fieldset className="start-options">
                <legend>What's it for?</legend>
                {kinds.map((k) => (
                    <label key={k.value} className={"start-option" + (kind === k.value ? " chosen" : "")}>
                        <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} />
                        <span><strong>{k.label}</strong><span className="muted small">{k.note}</span></span>
                    </label>
                ))}
            </fieldset>
            <label className="form-field">
                <span>{family ? "Recipe book name" : "Bar, restaurant or brewery name"}</span>
                <input required maxLength={100} value={name} placeholder={family ? "Family recipes" : "Shady's Corner"} onChange={(e) => setName(e.target.value)} />
            </label>
            {family && askName && (
                <label className="form-field">
                    <span>Your name</span>
                    <input required maxLength={60} value={myName} placeholder="What your family calls you" onChange={(e) => setMyNameText(e.target.value)} />
                    <span className="muted small">Shown on recipes you add, like "Added by Mom".</span>
                </label>
            )}
            {!family && (
                <fieldset className="start-options">
                    <legend>Start with</legend>
                    {options.filter((o) => o.show).map((o) => (
                        <label key={o.value} className={"start-option" + (start === o.value ? " chosen" : "")}>
                            <input type="radio" name="start" value={o.value} checked={start === o.value} onChange={() => setStart(o.value)} />
                            <span><strong>{o.label}</strong><span className="muted small">{o.note}</span></span>
                        </label>
                    ))}
                </fieldset>
            )}
            {error && <p className="error" role="alert">{error}</p>}
            <div className="button-row">
                <button type="submit" disabled={busy}>{busy ? "Setting up…" : "Set it up"}</button>
                {onCancel && <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>}
            </div>
        </form>
    );
}

export function BarSetupScreen() {
    const session = useSession();
    const [busy, setBusy] = useState(false);

    // Check again for an invite (after someone sends one)
    async function checkInvites() {
        setBusy(true);
        await supabase!.rpc("accept_invites");
        location.reload();
    }

    return (
        <AuthCard title="Set up your place" subtitle={"Signed in as " + session.email + "."}>
            <PlaceSetupForm />
            <div className="auth-invite">
                <p className="muted small">
                    Joining someone else's place instead? Ask them for their invite link or QR code, or to invite <strong>{session.email}</strong>, then:
                </p>
                <div className="button-row">
                    <button className="secondary" disabled={busy} onClick={checkInvites}>I've been invited</button>
                    <button className="link-button" onClick={() => void signOut()}>Sign out</button>
                </div>
            </div>
        </AuthCard>
    );
}
