// ===== names.ts =====
// Who's who in the open place, for "Added by Mom" and "(Sarah's Version)".
// Loaded once per place and kept; refreshed when I change my own name.

import { useEffect, useState } from "react";
import { cloudEnabled } from "./client";
import { useSession } from "./session";
import { listMembers, nameOf } from "./team";

const cache = new Map<string, Map<string, string>>();    // place id -> (account id -> name)
const listeners = new Set<() => void>();

async function load(barId: string) {
    const members = await listMembers(barId);
    cache.set(barId, new Map(members.map((m) => [m.userId, nameOf(m)])));
    listeners.forEach((l) => l());
}

// Forget the names (after I rename myself) so they load again
export function reloadNames() {
    const ids = [...cache.keys()];
    cache.clear();
    ids.forEach((id) => void load(id).catch(() => undefined));
}

// account id -> name, for the open place (empty until loaded, or without accounts)
export function useMemberNames(): Map<string, string> {
    const session = useSession();
    const barId = session.mode === "ready" ? session.bar?.id ?? null : null;
    const [, redraw] = useState(0);
    useEffect(() => {
        const listener = () => redraw((n) => n + 1);
        listeners.add(listener);
        if (cloudEnabled && barId && !cache.has(barId)) void load(barId).catch(() => undefined);
        return () => { listeners.delete(listener); };
    }, [barId]);
    return (barId && cache.get(barId)) || new Map();
}

// My own name in the open place
export function useMyName(): string {
    const session = useSession();
    const names = useMemberNames();
    return names.get(session.userId) ?? "";
}

// In a Just recipes place: can I change this recipe, and who added it?
//     the owner changes any; everyone else only the ones they added
//     without accounts (this device only) everything is yours
export function useRecipeRights(recipe: { createdBy: string }): { canEdit: boolean; addedBy: string } {
    const session = useSession();
    const names = useMemberNames();
    const addedBy = recipe.createdBy ? names.get(recipe.createdBy) ?? "" : "";
    if (session.mode !== "ready") return { canEdit: true, addedBy };
    const canEdit = session.bar?.role === "owner" || recipe.createdBy === session.userId;
    return { canEdit, addedBy };
}
