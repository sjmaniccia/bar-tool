// ===== theme.ts =====
// Light or dark mode.
//     IF the person picked one with the switch -> use it (saved in this browser)
//     ELSE follow the phone or computer setting

export type Theme = "light" | "dark";

const KEY = "agave.theme";

// The theme the person picked, or null if they never picked one
function savedTheme(): Theme | null {
    try {
        const value = localStorage.getItem(KEY);
        return value === "light" || value === "dark" ? value : null;
    } catch {
        return null;   // storage can be blocked (private mode, etc.)
    }
}

// What the device prefers
function deviceTheme(): Theme {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// The theme showing right now
export function currentTheme(): Theme {
    return savedTheme() ?? deviceTheme();
}

// Tell the stylesheet which colors to use
function apply(theme: Theme | null) {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
}

// Run once at startup so a saved choice shows before the first draw
export function applySavedTheme() {
    apply(savedTheme());
}

// Flip light <-> dark and remember the choice
export function toggleTheme(): Theme {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    apply(next);
    try {
        localStorage.setItem(KEY, next);
    } catch {
        // FIXME: tell the person their choice won't be remembered
    }
    return next;
}
