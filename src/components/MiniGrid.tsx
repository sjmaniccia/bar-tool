// ===== MiniGrid.tsx =====
// A grid of small tiles: three across on a phone (so 9 to 12 fit on a screen), more on a
// computer. Each tile: a picture (or the first letter on a tint), the name, one short line.
// Used by All recipes and the Classics library.

import type { ReactNode } from "react";
import { Link } from "react-router";

export function MiniGrid({ children }: { children: ReactNode }) {
    return <div className="mini-grid">{children}</div>;
}

interface TileProps {
    name: string;
    photo?: string;
    tint?: string;
    meta?: ReactNode;          // one short line: "24% · Cocktail", "Serves 8", "Sour"
    badge?: ReactNode;         // top-right corner: a check, "missing prices"
    to?: string;               // a link...
    onClick?: () => void;      // ...or a button
    picked?: boolean | null;   // null = not picking; true/false = a tick box on the tile
}

export function MiniTile({ name, photo, tint = "var(--surface-2, #f3f1ec)", meta, badge, to, onClick, picked = null }: TileProps) {
    const inside = (
        <>
            <span className="mini-art" style={{ background: tint }}>
                {photo ? <img src={photo} alt="" loading="lazy" /> : <span className="mini-initial" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>}
                {picked !== null && <span className={"mini-pick" + (picked ? " on" : "")} aria-hidden="true">{picked ? "✓" : ""}</span>}
                {badge && <span className="mini-badge">{badge}</span>}
            </span>
            <strong className="mini-name">{name}</strong>
            {meta && <span className="mini-meta">{meta}</span>}
        </>
    );
    if (to && picked === null) return <Link to={to} className="mini-tile">{inside}</Link>;
    return <button type="button" className={"mini-tile" + (picked ? " picked" : "")} aria-pressed={picked ?? undefined} onClick={onClick}>{inside}</button>;
}
