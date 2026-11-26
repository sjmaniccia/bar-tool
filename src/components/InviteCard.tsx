// ===== InviteCard.tsx =====
// Get people on the team in a minute: a QR code to scan off your phone, or a link to text.
//
//     ON open: get the bar's working staff link (or make one), draw its QR code
//     Owners can switch to a manager link; managers make staff links only
//     "Text it": the phone's share sheet (Messages, WhatsApp...) or, on a computer, copy
//     "New link": turns the old one off right away (if the QR code got photographed somewhere)
//     Tap the QR code: it fills the screen, easy for another phone's camera to read.
//     Tap anywhere to put it back. fullAtStart: open it that way (the Invite button's sheet).
// Links work for 14 days and 50 people (team-links.sql).
// A "Just recipes" place: one kind of link (manager = "Family": add recipes, change their own).

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createPortal } from "react-dom";
import { useSession } from "../cloud/session";
import { inviteLinkFor, replaceInviteLink, type InviteLink } from "../cloud/team";
import type { Role } from "../cloud/sync";
import { useRecipesOnly } from "../data/place";

export default function InviteCard({ compact = false, fullAtStart = false }: { compact?: boolean; fullAtStart?: boolean }) {
    const session = useSession();
    const barId = session.mode === "ready" ? session.bar?.id ?? null : null;
    const isOwner = session.bar?.role === "owner";
    const recipesOnly = useRecipesOnly();
    const [chosen, setRole] = useState<Role>("staff");
    const role: Role = recipesOnly ? "manager" : chosen;
    const [link, setLink] = useState<InviteLink | null>(null);
    const [qr, setQr] = useState("");
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const [full, setFull] = useState(false);
    const [shownFull, setShownFull] = useState(false);     // fullAtStart happens once

    // Get (or make) the link for the chosen role, then draw it
    useEffect(() => {
        if (!barId) return;
        let current = true;
        setLink(null);
        setError("");
        void inviteLinkFor(barId, role).then((result) => {
            if (!current) return;
            if (typeof result === "string") setError(result);
            else setLink(result);
        });
        return () => { current = false; };
    }, [barId, role]);

    useEffect(() => {
        if (!link) return;
        void QRCode.toDataURL(link.url, { margin: 1, width: 720, color: { dark: "#1c1c1a", light: "#ffffff" } }).then(setQr);
    }, [link]);

    useEffect(() => {
        if (fullAtStart && qr && !shownFull) {
            setFull(true);
            setShownFull(true);
        }
    }, [fullAtStart, qr, shownFull]);

    // Escape puts it back too
    useEffect(() => {
        if (!full) return;
        const key = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [full]);

    if (!barId) {
        return <p className="muted">Sign in to invite your team. The demo stays on this device.</p>;
    }

    async function share() {
        if (!link) return;
        const text = "Join " + (session.bar?.name ?? "our team") + " on Agave for our " + (recipesOnly ? "recipes: " : "recipes and specs: ") + link.url;
        if (navigator.share) {
            try {
                await navigator.share({ title: "Join " + session.bar?.name + " on Agave", text });
                return;
            } catch { /* closed the share sheet */ return; }
        }
        try {
            await navigator.clipboard.writeText(link.url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            prompt("Copy this link:", link.url);
        }
    }

    async function fresh() {
        if (!link || !confirm("Turn off this link and make a new one? Anyone with the old one can't join with it anymore.")) return;
        const result = await replaceInviteLink(barId!, link);
        if (typeof result === "string") setError(result);
        else setLink(result);
    }

    return (
        <div className={"invite-card" + (compact ? " compact" : "")}>
            {isOwner && !recipesOnly && (
                <div className="invite-roles" role="radiogroup" aria-label="They join as">
                    <button role="radio" aria-checked={role === "staff"} className={role === "staff" ? "active" : ""} onClick={() => setRole("staff")}>Staff</button>
                    <button role="radio" aria-checked={role === "manager"} className={role === "manager" ? "active" : ""} onClick={() => setRole("manager")}>Manager</button>
                </div>
            )}
            <div className="invite-body">
                <div className="invite-qr">
                    {qr ? (
                        <button type="button" className="qr-button" aria-label="Show the QR code full screen" onClick={() => setFull(true)}>
                            <img src={qr} alt={"QR code to join " + session.bar?.name} />
                            <span className="muted small">Tap to make it bigger</span>
                        </button>
                    ) : <span className="muted small">{error ? "" : "Making a link…"}</span>}
                </div>
                <div className="invite-copy">
                    <strong>Pass your phone around</strong>
                    {recipesOnly ? (
                        <span className="muted small">
                            They scan it with their camera, make an account, and they're in. They can add recipes and
                            change their own. For anyone else's, they make their own version.
                        </span>
                    ) : (
                        <span className="muted small">
                            They scan it with their camera, make an account, and they're in as {role === "manager" ? "a manager" : "staff"}.
                            {role === "staff" ? " Staff see recipes and specs, count and log waste. Never costs." : " Managers see and change everything but the owners."}
                        </span>
                    )}
                </div>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="button-row">
                <button onClick={() => void share()} disabled={!link}>{copied ? "Link copied" : "Text them a link"}</button>
                {link && <button className="secondary" onClick={() => void fresh()}>New link</button>}
            </div>
            {link && <p className="muted small invite-foot">Works for 14 days{link.uses > 0 ? " · " + link.uses + " joined with it" : ""}.</p>}
            {full && qr && createPortal(
                <div className="qr-full" role="dialog" aria-modal="true" aria-label="QR code to join" onClick={() => setFull(false)}>
                    <img src={qr} alt={"QR code to join " + session.bar?.name} />
                    <strong>Join {session.bar?.name}</strong>
                    <span>Point your phone's camera here</span>
                    <button type="button" className="secondary">Done</button>
                </div>,
                document.body
            )}
        </div>
    );
}
