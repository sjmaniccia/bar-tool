// ===== Layout.tsx =====
// The frame around every page: the top bar and the sidebar.
// <Outlet /> is where the current page (Dashboard, Recipes...) is drawn.
// On phones the sidebar hides behind a menu button.
//
// Signed in, the top bar also shows:
//     the bar's name (a dropdown to switch, if you're in more than one)
//     whether changes are saved to the server
//     your account menu (Team, sign out)

import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { currentTheme, toggleTheme } from "../theme";
import { leaveDemo, signOut, switchBar, useSession, type Session } from "../cloud/session";
import { cloudEnabled } from "../cloud/client";
import { canOpen } from "../cloud/access";
import { BrandMark } from "./BrandMark";

interface NavItem {
    to: string;
    label: string;
    end?: boolean;
}

// The sidebar's sections and links
const SECTIONS: { title: string; links: NavItem[] }[] = [
    {
        title: "Recipes",
        links: [
            { to: "/recipes", label: "All Recipes" },
            { to: "/menus", label: "Menus" },
            { to: "/specs", label: "Spec books" },
            { to: "/training", label: "Training" },
            { to: "/classics", label: "Classics library" }
        ]
    },
    { title: "Overview", links: [{ to: "/dashboard", label: "Dashboard" }] },
    {
        title: "Inventory",
        links: [
            { to: "/products", label: "Products" },
            { to: "/ingredients", label: "Ingredients" },
            { to: "/counts", label: "Stock counts" },
            { to: "/waste", label: "Waste log" }
        ]
    },
    {
        title: "Purchasing",
        links: [
            { to: "/orders", label: "Orders" },
            { to: "/invoices", label: "Invoices" },
            { to: "/vendors", label: "Vendors" }
        ]
    },
    {
        title: "Reports",
        links: [
            { to: "/reports", label: "Variance" },
            { to: "/sales", label: "Sales" },
            { to: "/data", label: "Backup & export" }
        ]
    }
];

export default function Layout() {
    // Is the phone menu open? useState remembers a value between redraws.
    const [menuOpen, setMenuOpen] = useState(false);
    const [theme, setTheme] = useState(currentTheme);
    const location = useLocation();
    const session = useSession();
    const role = session.bar?.role ?? null;

    // WHEN the page changes, close the phone menu
    useEffect(() => setMenuOpen(false), [location.pathname]);

    // Staff land on counting (recipes and the dashboard show costs)
    if (role === "staff" && (location.pathname === "/" || location.pathname === "/recipes")) return <Navigate to="/counts" replace />;

    // Only show links this person can open; drop sections that end up empty
    const sections = SECTIONS
        .map((s) => ({ ...s, links: s.links.filter((l) => canOpen(l.to, role)) }))
        .filter((s) => s.links.length > 0);
    if (session.mode === "ready") sections.push({ title: "Account", links: [{ to: "/team", label: "Team" }] });

    return (
        <div className="app">
            <header className="topbar no-print">
                <button className="menu-button" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
                <Link to="/" className="brand"><BrandMark />Agave</Link>
                {session.mode === "ready" && <BarName session={session} />}
                <div className="topbar-right">
                    {session.mode === "ready" && <SyncBadge session={session} />}
                    {/* WHEN clicked, switch light <-> dark; the label names the mode you'll get */}
                    <button className="theme-toggle" onClick={() => setTheme(toggleTheme())}>
                        {theme === "dark" ? "Light mode" : "Dark mode"}
                    </button>
                    {session.mode === "ready" && <AccountMenu session={session} />}
                </div>
            </header>

            <nav className={"sidebar no-print" + (menuOpen ? " open" : "")}>
                {sections.map((section) => (
                    <div className="nav-section" key={section.title}>
                        <div className="nav-title">{section.title}</div>
                        {section.links.map((link) => (
                            // NavLink adds the "active" class when its page is open
                            <NavLink key={link.label} to={link.to} end={link.end} className="nav-link">
                                {link.label}
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>

            <main className="content">
                {session.demo && cloudEnabled && (
                    <div className="demo-banner no-print">
                        <span>You're trying Agave without an account. Everything stays in this browser.</span>
                        <button className="secondary" onClick={leaveDemo}>Sign in to save and share</button>
                    </div>
                )}
                {session.mode === "ready" && session.sync.state === "error" && (
                    <p className="sync-message error no-print" role="alert">{session.sync.message}</p>
                )}
                {canOpen(location.pathname, role) ? <Outlet /> : <NotAllowed />}
            </main>
        </div>
    );
}

// The open bar's name, or a dropdown to switch between bars
function BarName({ session }: { session: Session }) {
    if (session.bars.length <= 1) return <span className="bar-name">{session.bar?.name}</span>;
    return (
        <select className="bar-switch" aria-label="Switch bar" value={session.bar?.id} onChange={(e) => void switchBar(e.target.value)}>
            {session.bars.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
    );
}

// A dot and a word: is everything on the server?
function SyncBadge({ session }: { session: Session }) {
    const { state, pending, message } = session.sync;
    const labels = {
        loading: "Loading…",
        saved: "Saved",
        saving: "Saving…",
        offline: pending > 0 ? "Offline · " + pending + " waiting" : "Offline",
        error: "Saved"
    };
    return (
        <span className={"sync-badge " + state} title={message || "Changes are saved to your account"} role="status">
            <span className="sync-dot" aria-hidden="true" />{labels[state]}
        </span>
    );
}

// Email, a link to the Team page, and sign out
function AccountMenu({ session }: { session: Session }) {
    const [open, setOpen] = useState(false);
    const location = useLocation();
    useEffect(() => setOpen(false), [location.pathname]);

    // Signing out wipes this device's copy, so warn if changes haven't reached the server
    async function out() {
        if (session.sync.pending > 0 && !confirm(session.sync.pending + " changes haven't been sent yet (no connection). Sign out and lose them?")) return;
        await signOut();
    }

    return (
        <div className="account">
            <button className="account-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
                {session.email.slice(0, 1).toUpperCase()}
            </button>
            {open && (
                <div className="account-menu" role="menu">
                    <div className="account-email">{session.email}</div>
                    <div className="muted small">{session.bar?.name} · {session.bar?.role}</div>
                    <Link to="/team" role="menuitem">Team</Link>
                    <button className="link-button" role="menuitem" onClick={() => void out()}>Sign out</button>
                </div>
            )}
        </div>
    );
}

function NotAllowed() {
    return (
        <div className="page">
            <h1>Managers only</h1>
            <p className="muted">Your account can count stock, log waste, and use training and spec books. Ask a manager if you need more.</p>
            <p><Link to="/counts">Go to stock counts</Link></p>
        </div>
    );
}
