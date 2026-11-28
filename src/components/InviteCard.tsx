// ===== InviteCard.tsx =====
// Get people on the team in a minute: a QR code to scan off your phone, or a link to text.
//
//     ON open: get the bar's working staff link (or make one), draw its QR code
//     Owners can switch to a manager link; managers make staff links only
//     "Text it": the phone's share sheet (Messages, WhatsApp...) or, on a computer, copy
//     "New link": turns the old one off right away (if the QR code got photographed somewhere)
//     Two buttons, nothing else to look at: "Show QR code" fills the screen with it (easy
//     for another phone's camera), tap anywhere to put it away; "Text a link" opens the
//     share sheet. The QR code is never shown until it's asked for.
// Links work for 14 days and 50 people (team-links.sql).
// A "Just recipes" place: one kind of link (manager = "Family": add recipes, change their own).

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createPortal } from "react-dom";

function Icon({ d, size = 22 }: { d: string; size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
import { useSession } from "../cloud/session";
import { inviteLinkFor, replaceInviteLink, type InviteLink } from "../cloud/team";
import type { Role } from "../cloud/sync";
import { useRecipesOnly } from "../data/place";

export default function InviteCard({ compact = false }: { compact?: boolean }) {
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
            <p className="muted small invite-about">
                {recipesOnly
                    ? "They make an account and they're in. They can add recipes and change their own; for anyone else's, they make their own version."
                    : role === "staff"
                    ? "They make an account and they're in as staff: recipes and specs, counts and the waste log. Never costs."
                    : "They make an account and they're in as a manager: everything but the owners."}
            </p>
            <div className="invite-actions">
                <button type="button" className="invite-action" disabled={!qr} onClick={() => setFull(true)}>
                    <Icon d="M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 14h2v2h-2z M14 18h2v2h-2z M18 18h2v2h-2z M6.5 6.5h1v1h-1z M16.5 6.5h1v1h-1z M6.5 16.5h1v1h-1z" size={26} />
                    <span><strong>Show QR code</strong><span className="muted small">They scan it with their camera</span></span>
                </button>
                <button type="button" className="invite-action" disabled={!link} onClick={() => void share()}>
                    <Icon d="M4 5h16v11H9l-5 4z" size={26} />
                    <span><strong>{copied ? "Link copied" : "Text a link"}</strong><span className="muted small">Messages, email, anything</span></span>
                </button>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            {link && (
                <p className="muted small invite-foot">
                    Works for 14 days{link.uses > 0 ? " · " + link.uses + " joined with it" : ""} ·{" "}
                    <button className="link-button small" onClick={() => void fresh()}>New link</button>
                </p>
            )}
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
