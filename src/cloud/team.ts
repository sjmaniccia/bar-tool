// ===== team.ts =====
// The Team page's reads and changes. The rules (who can invite whom, a bar
// always keeps an owner) live in the database, in schema.sql; these just ask.

import { supabase } from "./client";
import { refreshBars } from "./session";
import type { Role } from "./sync";

export interface Member {
    userId: string;
    email: string;
    role: Role;
    joinedAt: string;
}

export interface Invite {
    id: string;
    email: string;
    role: Role;
    createdAt: string;
}

export async function listMembers(barId: string): Promise<Member[]> {
    const { data, error } = await supabase!.from("members").select("user_id, email, role, joined_at").eq("bar_id", barId).order("joined_at");
    if (error) throw error;
    return data.map((m) => ({ userId: m.user_id, email: m.email, role: m.role, joinedAt: m.joined_at }));
}

// Only owners and managers can see invites (others get an empty list)
export async function listInvites(barId: string): Promise<Invite[]> {
    const { data, error } = await supabase!.from("invites").select("id, email, role, created_at").eq("bar_id", barId).order("created_at");
    if (error) throw error;
    return data.map((i) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.created_at }));
}

// Each returns an error message, or null if it worked
export async function invite(barId: string, email: string, role: Role): Promise<string | null> {
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return "That doesn't look like an email address.";
    const { error } = await supabase!.from("invites").insert({ bar_id: barId, email: clean, role });
    if (error?.code === "23505") return clean + " is already invited.";
    return error ? error.message : null;
}

export async function cancelInvite(inviteId: string): Promise<string | null> {
    const { error } = await supabase!.from("invites").delete().eq("id", inviteId);
    return error ? error.message : null;
}

export async function setRole(barId: string, userId: string, role: Role): Promise<string | null> {
    const { error } = await supabase!.rpc("set_member_role", { target_bar: barId, target_user: userId, new_role: role });
    if (!error) await refreshBars();
    return error ? error.message : null;
}

export async function removeMember(barId: string, userId: string): Promise<string | null> {
    const { error } = await supabase!.rpc("remove_member", { target_bar: barId, target_user: userId });
    return error ? error.message : null;
}

export async function renameBar(barId: string, name: string): Promise<string | null> {
    const { error } = await supabase!.from("bars").update({ name: name.trim() }).eq("id", barId);
    if (!error) await refreshBars();
    return error ? error.message : null;
}

export const ROLE_NOTES: Record<Role, string> = {
    owner: "Everything, including who's on the team",
    manager: "Everything except changing owners and managers",
    staff: "Counts, waste log, training and spec books"
};
