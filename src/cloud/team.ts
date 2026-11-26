// ===== team.ts =====
// The Team page's reads and changes. The rules (who can invite whom, a bar
// always keeps an owner) live in the database, in schema.sql; these just ask.

import { supabase } from "./client";
import { refreshBars } from "./session";
import type { Role } from "./sync";

export interface Member {
    userId: string;
    email: string;
    name: string;           // what they call themselves ("Mom"), "" = not set (recipes-only.sql)
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
    const { data, error } = await supabase!.from("members").select("*").eq("bar_id", barId).order("joined_at");
    if (error) throw error;
    return data.map((m) => ({ userId: m.user_id, email: m.email, name: m.display_name ?? "", role: m.role, joinedAt: m.joined_at }));
}

// The name others see on recipes I add ("Added by Mom"), in every place I'm in
export async function setMyName(name: string): Promise<string | null> {
    const { error } = await supabase!.rpc("set_my_name", { new_name: name });
    return error ? error.message : null;
}

// What to call someone: their name, or the start of their email ("sarah" from sarah@…)
export function nameOf(member: Pick<Member, "name" | "email">): string {
    if (member.name) return member.name;
    const start = member.email.split("@")[0].replace(/[._-]+/g, " ").trim();
    return start.charAt(0).toUpperCase() + start.slice(1);
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


// ===== Invite links (team-links.sql) =====
// A link anyone can open to join the bar: shown as a QR code, or texted.

export interface InviteLink {
    code: string;
    role: Role;
    url: string;
    expiresAt: string;
    uses: number;
}

// Where a link points: this app, with ?join=<code>
export function linkUrl(code: string): string {
    return location.origin + location.pathname + "?join=" + code;
}

// The newest working link for a role, or a new one -> the link, or an error message
export async function inviteLinkFor(barId: string, role: Role): Promise<InviteLink | string> {
    const { data, error } = await supabase!.from("invite_links")
        .select("code, role, expires_at, uses, max_uses, revoked")
        .eq("bar_id", barId).eq("role", role).eq("revoked", false)
        .gt("expires_at", new Date(Date.now() + 24 * 3600 * 1000).toISOString())   // at least a day left
        .order("created_at", { ascending: false }).limit(1);
    if (error) return /invite_links/.test(error.message) ? "Invite links aren't set up yet: run supabase/team-links.sql." : error.message;
    const row = (data ?? []).find((l) => l.uses < l.max_uses);
    if (row) return { code: row.code, role: row.role, url: linkUrl(row.code), expiresAt: row.expires_at, uses: row.uses };
    const made = await supabase!.rpc("make_invite_link", { target_bar: barId, link_role: role });
    if (made.error) return made.error.message;
    const code = made.data as string;
    return { code, role, url: linkUrl(code), expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(), uses: 0 };
}

// Turn a link off and make a fresh one (if the QR code got out somewhere it shouldn't)
export async function replaceInviteLink(barId: string, link: InviteLink): Promise<InviteLink | string> {
    const { error } = await supabase!.rpc("revoke_invite_link", { link_code: link.code });
    if (error) return error.message;
    return inviteLinkFor(barId, link.role);
}

// What a link is for, before signing in -> {barName, role}, or null if it doesn't work
export async function peekInviteLink(code: string): Promise<{ barName: string; role: Role } | null> {
    const { data, error } = await supabase!.rpc("peek_invite_link", { link_code: code });
    const row = (data as { bar_name: string; role: Role }[] | null)?.[0];
    return error || !row ? null : { barName: row.bar_name, role: row.role };
}
