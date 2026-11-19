// ===== Layout.tsx =====
// The frame around every page: the top bar and the sidebar.
// <Outlet /> is where the current page (Dashboard, Recipes...) is drawn.
// On phones the sidebar hides behind a menu button.

import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { currentTheme, toggleTheme } from "../theme";

// The Proof mark: a seal with a dot in the middle (like a bottle cap seen from above)
function ProofMark() {
    return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="24" cy="24" r="5" fill="currentColor" />
        </svg>
    );
}

// The sidebar's sections and links (soon: not built yet)
const SECTIONS = [
    { title: "Home", links: [{ to: "/", label: "Dashboard", end: true }] },
    { title: "Recipes", links: [{ to: "/recipes", label: "All Recipes" }] },
    {
        title: "Inventory",
        links: [
            { to: "/products", label: "Products" },
            { to: "/ingredients", label: "Ingredients" },
            { to: "/vendors", label: "Vendors" }
        ]
    },
    {
        title: "Coming soon",
        links: [
            { label: "Ordering", soon: true },
            { label: "Invoices", soon: true },
            { label: "Stock Count", soon: true },
            { label: "Menus", soon: true }
        ]
    }
];

export default function Layout() {
    // Is the phone menu open? useState remembers a value between redraws.
    const [menuOpen, setMenuOpen] = useState(false);
    const [theme, setTheme] = useState(currentTheme);
    const location = useLocation();

    // WHEN the page changes, close the phone menu
    useEffect(() => setMenuOpen(false), [location.pathname]);

    return (
        <div className="app">
            <header className="topbar no-print">
                <button className="menu-button" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
                <Link to="/" className="brand"><ProofMark />Proof</Link>
                {/* WHEN clicked, switch light <-> dark; the label names the mode you'll get */}
                <button className="theme-toggle" onClick={() => setTheme(toggleTheme())}>
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
            </header>

            <nav className={"sidebar no-print" + (menuOpen ? " open" : "")}>
                {SECTIONS.map((section) => (
                    <div className="nav-section" key={section.title}>
                        <div className="nav-title">{section.title}</div>
                        {section.links.map((link) =>
                            "to" in link && link.to ? (
                                // NavLink adds the "active" class when its page is open
                                <NavLink key={link.label} to={link.to} end={"end" in link && link.end} className="nav-link">
                                    {link.label}
                                </NavLink>
                            ) : (
                                <span key={link.label} className="nav-link disabled">{link.label}</span>
                            )
                        )}
                    </div>
                ))}
            </nav>

            <main className="content">
                <Outlet />
            </main>
        </div>
    );
}
