// ===== AuthScreens.tsx =====
// The screens before the app: sign in, create an account, reset a password,
// and set up a bar. They share one centered card with the Agave seal.

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
    createBar, hasDeviceData, pendingJoinCode, sendPasswordReset, setNewPassword, signIn, signOut, signUp,
    startDemo, useSession, type StartWith
} from "../cloud/session";
import { peekInviteLink } from "../cloud/team";
import { supabase } from "../cloud/client";
import { BrandMark } from "../components/BrandMark";

// The card every screen sits in
function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-brand"><BrandMark />Agave</div>
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
    const [joining, setJoining] = useState<{ barName: string; role: string } | null | "bad">(null);
    useEffect(() => {
        if (!joinCode) return;
        void peekInviteLink(joinCode).then((info) => setJoining(info ?? "bad"));
    }, [joinCode]);
    const [tab, setTab] = useState<Tab>(joinCode ? "up" : "in");
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
            if (password.length < 8) {
                setBusy(false);
                return setError("Use a password of at least 8 characters.");
            }
            const result = await signUp(email, password);
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
                    You're joining <strong>{joining.barName}</strong> as {joining.role === "manager" ? "a manager" : "staff"}.
                    {tab === "up" ? " Make an account to get in." : " Sign in to get in."}
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

export function BarSetupScreen() {
    const session = useSession();
    const deviceHasData = hasDeviceData();
    const [name, setName] = useState("");
    const [start, setStart] = useState<StartWith>(deviceHasData ? "device" : "empty");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (name.trim() === "") return setError("Give your place a name.");
        setBusy(true);
        const result = await createBar(name, start);
        if (result) {
            setError(result);
            setBusy(false);
        }
    }

    // Check again for an invite (after a manager sends one)
    async function checkInvites() {
        setBusy(true);
        await supabase!.rpc("accept_invites");
        location.reload();
    }

    const options: { value: StartWith; label: string; note: string; show: boolean }[] = [
        { value: "device", label: "What I set up on this device", note: "Bring along the recipes and products you made before signing up.", show: deviceHasData },
        { value: "empty", label: "Nothing", note: "Start fresh, or import a price list from Backup & export.", show: true },
        { value: "sample", label: "Sample recipes and data", note: "Example recipes, counts and invoices to explore. You can clear them later.", show: true }
    ];

    return (
        <AuthCard title="Set up your place" subtitle={"Signed in as " + session.email + "."}>
            <form className="auth-form" onSubmit={submit}>
                <label className="form-field">
                    <span>Bar, restaurant or brewery name</span>
                    <input required maxLength={100} value={name} placeholder="Shady's Corner" onChange={(e) => setName(e.target.value)} />
                </label>
                <fieldset className="start-options">
                    <legend>Start with</legend>
                    {options.filter((o) => o.show).map((o) => (
                        <label key={o.value} className={"start-option" + (start === o.value ? " chosen" : "")}>
                            <input type="radio" name="start" value={o.value} checked={start === o.value} onChange={() => setStart(o.value)} />
                            <span><strong>{o.label}</strong><span className="muted small">{o.note}</span></span>
                        </label>
                    ))}
                </fieldset>
                {error && <p className="error" role="alert">{error}</p>}
                <button type="submit" disabled={busy}>{busy ? "Setting up…" : "Set it up"}</button>
            </form>
            <div className="auth-invite">
                <p className="muted small">
                    Joining a team instead? Ask your manager for their invite link or QR code, or to invite <strong>{session.email}</strong>, then:
                </p>
                <div className="button-row">
                    <button className="secondary" disabled={busy} onClick={checkInvites}>I've been invited</button>
                    <button className="link-button" onClick={() => void signOut()}>Sign out</button>
                </div>
            </div>
        </AuthCard>
    );
}
