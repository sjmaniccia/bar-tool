// ===== account.ts =====
// Which places go away when someone deletes their account (used by delete-account).
//
//     FOR each place the person belongs to
//         IF they're its only owner -> the place goes too (nobody would be left to run it),
//                                      with everyone else's access to it
//         ELSE                      -> they just leave it
// Kept apart from the function so it can be tested without a database.

export interface Membership {
    barId: string;
    barName: string;
    role: string;
    owners: number;      // how many owners the place has, this person included
    others: number;      // how many other people belong to it
}

export interface Plan {
    deleted: { barId: string; barName: string; others: number }[];
    left: { barId: string; barName: string }[];
}

export function deletionPlan(memberships: Membership[]): Plan {
    const plan: Plan = { deleted: [], left: [] };
    for (const m of memberships) {
        if (m.role === "owner" && m.owners <= 1) plan.deleted.push({ barId: m.barId, barName: m.barName, others: m.others });
        else plan.left.push({ barId: m.barId, barName: m.barName });
    }
    return plan;
}
