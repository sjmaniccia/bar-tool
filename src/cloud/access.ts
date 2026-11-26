// ===== access.ts =====
// Which pages each role can open. Staff get what they need on shift:
// counting, the waste log, training and spec books (no costs or ordering).
// The database enforces what they can CHANGE (schema.sql); this keeps the
// screens they can't use out of their way.
// FIXME: staff can still read costs through the data they sync; hide cost columns
// from staff screens, or split costs into a manager-only table, if that matters to a bar.

import type { Role } from "./sync";

// Page addresses staff can open (":" parts match anything)
//     plus their own account things: feedback, account, starting a place of their own
const STAFF_PAGES = ["/counts", "/counts/:id", "/waste", "/training", "/classics", "/specs", "/menus/:id/specs",
    "/feedback", "/account", "/places/new"];

export function canOpen(path: string, role: Role | null): boolean {
    if (role !== "staff") return true;
    const parts = path.split("/").filter(Boolean);
    return STAFF_PAGES.some((page) => {
        const want = page.split("/").filter(Boolean);
        return want.length === parts.length && want.every((w, i) => w.startsWith(":") || w === parts[i]);
    });
}

// Can this role change recipes, products, prices...?
export function canEdit(role: Role | null): boolean {
    return role !== "staff";
}
