// ===== Layout.tsx =====
// The frame around every page.
//
//     PHONE     a tab bar at the bottom: Home · Recipes · (+) · Stock · Numbers
//               the current section's pages as pills at the top (Menus, Spec sheets...)
//     COMPUTER  the same sections down the left, with their pages under them
//     TOP BAR   the place's name, saved/offline, Invite (always one tap away), the profile menu
//
// Sections show up as the place sets up (data/setup.ts): a new place sees only Home and
// Recipes. "Show everything" in the profile menu turns them all on.
// The + button opens what people actually do on a shift: scan an invoice, count,
// log something broken, scan recipes, add a recipe, invite the team, order.
// Staff get their own tabs: Specs · Training · (+) · Counts · Waste.
// A "Just recipes" place (data/place.ts) gets Home and Recipes only, and a + with
// recipe things: scan, new, invite family. No costs, stock, sales or invoices.

import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { leaveDemo, signOut, useSession, clearNotice, type Session } from "../cloud/session";
import { cloudEnabled } from "../cloud/client";
import { canOpen } from "../cloud/access";
import { useDb } from "../data/storage";
import { createRecipe } from "../data/actions";
import { useRecipesOnly } from "../data/place";
import { unlockedTabs, useSetupPrefs } from "../data/setup";
import { toast, unlockSound } from "../feedback";
import { BrandMark } from "./BrandMark";
import Toasts from "./Toasts";
import Sheet from "./Sheet";
import InviteCard from "./InviteCard";

type SectionId = "home" | "recipes" | "stock" | "numbers" | "staff-specs" | "staff-training" | "staff-counts" | "staff-waste";

interface Section {
    id: SectionId;
    label: string;
    to: string;
    icon: string;                       // SVG path(s)
    pages: { to: string; label: string }[];
    match: string[];                    // address starts that belong to this section
}

const ICONS = {
    home: "M4 11l8-7 8 7v9H4z M10 20v-6h4v6",
    recipes: "M5 4h14l-7 8z M12 12v7 M8 20h8",
    stock: "M9 3h6v4l2 3v11H7V10l2-3z M7 14h10",
    numbers: "M5 20V11 M12 20V5 M19 20v-6",
    training: "M4 6h16v12H4z M8 10h8 M8 14h5",
    waste: "M12 3l9 16H3z M12 10v4 M12 17v.5",
    plus: "M12 5v14 M5 12h14",
    invite: "M9 4.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7 M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M18 8v6 M15 11h6"
};

const MANAGER_SECTIONS: Section[] = [
    { id: "home", label: "Home", to: "/", icon: ICONS.home, pages: [], match: [] },
    {
        id: "recipes", label: "Recipes", to: "/recipes", icon: ICONS.recipes,
        pages: [
            { to: "/recipes", label: "All recipes" },
            { to: "/menus", label: "Menus" },
            { to: "/ingredients", label: "Ingredients" },     // what recipes are made of (Products, in Stock, is what you buy)
            { to: "/specs", label: "Spec sheets" },
            { to: "/training", label: "Training" },
            { to: "/classics", label: "Classics" }
        ],
        match: ["/recipes", "/menus", "/ingredients", "/specs", "/training", "/classics"]
    },
    {
        id: "stock", label: "Stock", to: "/counts", icon: ICONS.stock,
        pages: [
            { to: "/counts", label: "Counts" },
            { to: "/products", label: "Products" },
            { to: "/orders", label: "Orders" },
            { to: "/invoices", label: "Invoices" },
            { to: "/vendors", label: "Vendors" },
            { to: "/waste", label: "Waste" }
        ],
        match: ["/counts", "/products", "/orders", "/invoices", "/vendors", "/waste"]
    },
    {
        id: "numbers", label: "Numbers", to: "/dashboard", icon: ICONS.numbers,
        pages: [
            { to: "/dashboard", label: "Overview" },
            { to: "/reports", label: "Variance" },
            { to: "/sales", label: "Sales" }
        ],
        match: ["/dashboard", "/reports", "/sales"]
    }
];

// Just recipes: the recipe list is the whole Recipes section
const FAMILY_SECTIONS: Section[] = [
    MANAGER_SECTIONS[0],
    {
        id: "recipes", label: "Recipes", to: "/recipes", icon: ICONS.recipes,
        pages: [{ to: "/recipes", label: "All recipes" }, { to: "/menus", label: "Menus" }, { to: "/groceries", label: "Groceries" }],
        match: ["/recipes", "/menus", "/groceries"]
    }
];

const STAFF_SECTIONS: Section[] = [
    { id: "staff-specs", label: "Specs", to: "/specs", icon: ICONS.recipes, pages: [{ to: "/specs", label: "Spec sheets" }, { to: "/classics", label: "Classics" }], match: ["/specs", "/menus", "/classics"] },
    { id: "staff-training", label: "Training", to: "/training", icon: ICONS.training, pages: [], match: ["/training"] },
    { id: "staff-counts", label: "Counts", to: "/counts", icon: ICONS.stock, pages: [], match: ["/counts"] },
    { id: "staff-waste", label: "Waste", to: "/waste", icon: ICONS.waste, pages: [], match: ["/waste"] }
];

function sectionOf(path: string, sections: Section[]): Section | null {
    if (path === "/") return sections.find((s) => s.id === "home") ?? null;
    return sections.find((s) => s.match.some((m) => path === m || path.startsWith(m + "/"))) ?? null;
}

function Icon({ d, size = 24 }: { d: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {d.split(" M").map((part, i) => <path key={i} d={(i === 0 ? "" : "M") + part} />)}
        </svg>
    );
}

export default function Layout() {
    const location = useLocation();
    const session = useSession();
    const data = useDb();
    const role = session.bar?.role ?? null;
    const placeId = session.bar?.id ?? "local";
    const prefs = useSetupPrefs(placeId);
    const recipesOnly = useRecipesOnly();
    const [sheet, setSheet] = useState<"actions" | "invite" | null>(null);

    // WHEN the page changes, close any open sheet
    useEffect(() => setSheet(null), [location.pathname]);

    // Phones only play sound after a tap: unlock it on the first one
    useEffect(() => {
        const unlock = () => unlockSound();
        window.addEventListener("pointerdown", unlock, { passive: true });
        return () => window.removeEventListener("pointerdown", unlock);
    }, []);

    // A one-time message from signing in (like "You joined Shady's Corner")
    useEffect(() => {
        if (session.notice) {
            toast(session.notice, { tone: /doesn't work|can't/.test(session.notice) ? "warn" : "good", sound: "success" });
            clearNotice();
        }
    }, [session.notice]);

    const staff = role === "staff";
    // Staff start on the spec sheets (Home and recipes show costs)
    if (staff && (location.pathname === "/" || location.pathname === "/recipes")) return <Navigate to="/specs" replace />;

    const unlocked = unlockedTabs(data, prefs.showAll);
    const all = staff ? STAFF_SECTIONS : recipesOnly ? FAMILY_SECTIONS : MANAGER_SECTIONS;
    const current = sectionOf(location.pathname, all);
    // A locked section still shows while you're on one of its pages
    const sections = all.filter((s) =>
        (s.id !== "stock" || unlocked.stock || current?.id === "stock") &&
        (s.id !== "numbers" || unlocked.numbers || current?.id === "numbers"));
    // Family places: the owner invites (everyone joins able to add recipes)
    const canInvite = session.mode === "ready" && !staff && (!recipesOnly || role === "owner");

    // Phone tab bar: the sections with the + in the middle
    const half = Math.ceil(sections.length / 2);
    const tabs: (Section | "plus")[] = [...sections.slice(0, half), "plus", ...sections.slice(half)];

    return (
        <div className="app">
            <header className="topbar no-print">
                <Link to={staff ? "/specs" : "/"} className="brand"><BrandMark />Agave</Link>
                {session.mode === "ready" && <BarName session={session} />}
                <div className="topbar-right">
                    {session.mode === "ready" && <SyncBadge session={session} />}
                    {canInvite && (
                        <button className="icon-circle" aria-label={recipesOnly ? "Invite family" : "Invite your team"} title={recipesOnly ? "Invite family" : "Invite your team"} onClick={() => setSheet("invite")}>
                            <Icon d={ICONS.invite} size={20} />
                        </button>
                    )}
                    <ProfileMenu session={session} recipesOnly={recipesOnly} />
                </div>
            </header>

            <nav className="sidebar no-print" aria-label="Sections">
                <button className="sidebar-add" onClick={() => setSheet("actions")}>
                    <Icon d={ICONS.plus} size={18} /> Add or scan
                </button>
                {sections.map((section) => (
                    <div className="nav-section" key={section.id}>
                        <NavLink to={section.to} end={section.id === "home"} className={"nav-link nav-head" + (current?.id === section.id ? " in-section" : "")}>
                            <Icon d={section.icon} size={20} />{section.label}
                        </NavLink>
                        {section.pages.length > 1 && section.pages.map((p) => (
                            <NavLink key={p.to} to={p.to} className="nav-link nav-sub">{p.label}</NavLink>
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
                {/* On phones: the current section's pages, as pills */}
                {current && current.pages.length > 1 && (
                    <nav className="section-pills no-print" aria-label={current.label + " pages"}>
                        {current.pages.map((p) => <NavLink key={p.to} to={p.to} className="pill">{p.label}</NavLink>)}
                    </nav>
                )}
                {canOpen(location.pathname, role) ? <Outlet /> : <NotAllowed />}
            </main>

            <nav className="tabbar no-print" aria-label="Main">
                {tabs.map((tab) => tab === "plus" ? (
                    <button key="plus" className="tab-plus" aria-label="Add, scan or count" onClick={() => setSheet("actions")}>
                        <Icon d={ICONS.plus} size={28} />
                    </button>
                ) : (
                    <NavLink key={tab.id} to={tab.to} end={tab.id === "home"} className={"tab-link" + (current?.id === tab.id ? " active" : "")}>
                        <Icon d={tab.icon} />{tab.label}
                    </NavLink>
                ))}
            </nav>

            <Toasts />
            {sheet === "actions" && <ActionSheet staff={staff} recipesOnly={recipesOnly} canInvite={canInvite} onInvite={() => setSheet("invite")} onClose={() => setSheet(null)} />}
            {sheet === "invite" && (
                <Sheet title="Share recipes" onClose={() => setSheet(null)}>
                    <InviteCard compact />
                </Sheet>
            )}
        </div>
    );
}



function ActionSheet({ staff, recipesOnly, canInvite, onInvite, onClose }: { staff: boolean; recipesOnly: boolean; canInvite: boolean; onInvite: () => void; onClose: () => void }) {
    const navigate = useNavigate();
    const location = useLocation();
    const go = (to: string) => { onClose(); navigate(to); };
    const scanTile = { title: "Scan recipes", sub: "Pages from a book or a card", icon: "M5 4h10l4 4v12H5z M9 12h6 M9 16h6", run: () => go("/recipes/scan") };
    const newTile = { title: "New recipe", sub: recipesOnly ? "Type one in" : "Blank, or from a classic", icon: ICONS.plus, run: () => { const id = createRecipe("New recipe"); go("/recipes/" + id + "?edit=1"); } };
    // Inviting someone, said as what it's for: sharing the recipes
    const shareTile = { title: "Share recipes", sub: recipesOnly ? "Invite a friend" : "Invite a team member", icon: ICONS.invite, run: onInvite };
    const spillTile = { title: "Something spilled", sub: "Log waste or a spill", icon: ICONS.waste, run: () => go("/waste") };
    // Feedback, remembering which page it came from (fills out the grid, too)
    const feedbackTile = { title: "Send feedback", sub: "Ideas, bugs, anything", icon: "M4 5h16v11H9l-5 4z M8 9.5h8 M8 12.5h5", run: () => { onClose(); navigate("/feedback", { state: { from: location.pathname } }); } };
    const wasteScanTile = { title: "Scan the waste log", sub: "The paper sheet by the well", icon: "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5", run: () => go("/waste/scan") };
    const tiles: { title: string; sub: string; icon: string; run: () => void }[] = recipesOnly && !staff
        ? [
            scanTile,
            newTile,
            ...(canInvite ? [shareTile] : []),
            feedbackTile
        ]
        : staff
        ? [
            { title: "Count", sub: "Pick up where you left off", icon: ICONS.stock, run: () => go("/counts") },
            spillTile,
            wasteScanTile,
            feedbackTile
        ]
        : [
            { title: "Count", sub: "Pick up where you left off", icon: ICONS.stock, run: () => go("/counts") },
            canInvite ? shareTile : spillTile,
            scanTile,
            newTile,
            { title: "Order", sub: "Agave suggests what", icon: "M3 7h11v9H3z M14 10h4l3 3v3h-7", run: () => go("/orders") },
            wasteScanTile,
            ...(canInvite ? [spillTile] : []),
            feedbackTile
        ];
    return (
        <Sheet title={recipesOnly ? "Add a recipe" : "What's happening?"} onClose={onClose}>
            {!staff && !recipesOnly && (
                <button className="action-hero" onClick={() => go("/invoices/scan")}>
                    <span className="action-hero-icon"><Icon d="M4 8h3l2-3h6l2 3h3v11H4z M12 9.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7" size={26} /></span>
                    <span><strong>A delivery came in</strong><span>Scan the invoice</span></span>
                </button>
            )}
            <div className="action-grid">
                {tiles.map((t) => (
                    <button key={t.title} className="action-tile" onClick={t.run}>
                        <span className="action-icon"><Icon d={t.icon} size={22} /></span>
                        <strong>{t.title}</strong>
                        <span>{t.sub}</span>
                    </button>
                ))}
            </div>
        </Sheet>
    );
}


// ===== Top bar pieces =====

// The open place's name (computers). Switching places is on the Account page.
function BarName({ session }: { session: Session }) {
    return <span className="bar-name">{session.bar?.name}</span>;
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

// Who's signed in (tap for Account), the team, feedback, Settings (the Account page), sign out
const MENU_ICONS = {
    people: "M9 4.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7 M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5 M16 5a3 3 0 0 1 0 6 M18 14c2 .7 3.5 3 3.5 6",
    feedback: "M4 5h16v11H9l-5 4z M8 9.5h8 M8 12.5h5",
    settings: "M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6 M12 2.5v2.5 M12 19v2.5 M4.6 4.6l1.8 1.8 M17.6 17.6l1.8 1.8 M2.5 12h2.5 M19 12h2.5 M4.6 19.4l1.8-1.8 M17.6 6.4l1.8-1.8",
    signOut: "M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10"
};

function ProfileMenu({ session, recipesOnly }: { session: Session; recipesOnly: boolean }) {
    const [open, setOpen] = useState(false);
    const location = useLocation();
    useEffect(() => setOpen(false), [location.pathname]);
    const ready = session.mode === "ready";

    // Signing out wipes this device's copy, so warn if changes haven't reached the server
    async function out() {
        if (session.sync.pending > 0 && !confirm(session.sync.pending + " changes haven't been sent yet (no connection). Sign out and lose them?")) return;
        await signOut();
    }

    return (
        <div className="account">
            <button className="account-button" aria-label="Profile and settings" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
                {ready ? session.email.slice(0, 1).toUpperCase() : <Icon d="M12 4.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7 M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" size={20} />}
            </button>
            {open && (
                <div className="account-menu" role="menu">
                    {ready && (
                        <>
                            {/* Who and where: tap it for the Account page */}
                            <Link to="/account" role="menuitem" className="menu-who" onClick={() => setOpen(false)}>
                                <span className="account-email">{session.email}</span>
                                <span className="muted small">{session.bar?.name}</span>
                            </Link>
                            <div className="menu-rule" />
                            {session.bar?.role !== "staff" && (
                                <Link to="/team" role="menuitem" className="menu-item" onClick={() => setOpen(false)}><Icon d={MENU_ICONS.people} size={18} />{recipesOnly ? "People" : "Team"}</Link>
                            )}
                        </>
                    )}
                    <Link to="/feedback" state={{ from: location.pathname }} role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
                        <Icon d={MENU_ICONS.feedback} size={18} />Send feedback
                    </Link>
                    <Link to="/account" role="menuitem" className="menu-item" onClick={() => setOpen(false)}><Icon d={MENU_ICONS.settings} size={18} />Settings</Link>
                    {ready && (
                        <button className="link-button menu-item" role="menuitem" onClick={() => void out()}>
                            <Icon d={MENU_ICONS.signOut} size={18} />Sign out
                        </button>
                    )}
                    {session.demo && cloudEnabled && <button className="link-button" role="menuitem" onClick={leaveDemo}>Sign in</button>}
                </div>
            )}
        </div>
    );
}

function NotAllowed() {
    return (
        <div className="page">
            <h1>Managers only</h1>
            <p className="muted">Your account can see spec sheets and training, count stock and log waste. Ask a manager if you need more.</p>
            <p><Link to="/specs">Go to spec sheets</Link></p>
        </div>
    );
}
