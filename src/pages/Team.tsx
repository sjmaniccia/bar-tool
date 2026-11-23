// ===== Team.tsx =====
// Who's on the team, their roles, and invites.
//     Owners: rename the bar, invite anyone, change roles, remove people
//     Managers: invite staff
//     Everyone: see the team, leave the bar
// An invite is just an email: when that person makes an account (or signs in)
// with that email, they join automatically. Agave doesn't send the email yet,
// so tell them yourself.
// FIXME: send invite emails (a Supabase Edge Function with an email service like Resend)

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession, createBar, type StartWith } from "../cloud/session";
import { cancelInvite, invite, listInvites, listMembers, removeMember, renameBar, ROLE_NOTES, setRole, type Invite, type Member } from "../cloud/team";
import type { Role } from "../cloud/sync";
import { formatDate } from "../data/utils";
import TextInput from "../components/TextInput";
import InviteCard from "../components/InviteCard";

export default function Team() {
    const session = useSession();
    const bar = session.bar;
    const [members, setMembers] = useState<Member[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [error, setError] = useState("");
    const [email, setEmail] = useState("");
    const [role, setNewRole] = useState<Role>("staff");
    const [newBar, setNewBar] = useState("");

    // Load the team (again after every change)
    const load = useCallback(async () => {
        if (!bar) return;
        try {
            const [m, i] = await Promise.all([listMembers(bar.id), listInvites(bar.id)]);
            setMembers(m);
            setInvites(i);
        } catch (e) {
            setError("Couldn't load the team. Check your connection. (" + String(e) + ")");
        }
    }, [bar]);

    useEffect(() => { void load(); }, [load]);

    if (!bar) return null;
    const isOwner = bar.role === "owner";
    const canInvite = bar.role !== "staff";

    // Run a change, show its error if any, then reload
    async function run(action: Promise<string | null>) {
        const result = await action;
        setError(result ?? "");
        await load();
        return result;
    }

    async function sendInvite(event: FormEvent) {
        event.preventDefault();
        if ((await run(invite(bar!.id, email, role))) === null) setEmail("");
    }

    async function makeBar(event: FormEvent) {
        event.preventDefault();
        if (newBar.trim() === "") return;
        const result = await createBar(newBar, "empty" as StartWith);
        if (result) setError(result);
        else setNewBar("");
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Team</h1>
                    <p className="muted">Everyone at {bar.name}, and what they can do.</p>
                </div>
            </div>
            {error && <p className="error" role="alert">{error}</p>}

            {canInvite && (
                <section className="card">
                    <h2>Invite your team</h2>
                    <InviteCard />
                </section>
            )}

            {isOwner && (
                <section className="card">
                    <h2>Bar</h2>
                    <label className="form-field narrow-field">
                        <span>Name</span>
                        <TextInput value={bar.name} required onSave={(name) => void run(renameBar(bar.id, name))} />
                    </label>
                </section>
            )}

            <section className="card table-card">
                <h2>People</h2>
                <table className="table">
                    <thead><tr><th>Email</th><th>Role</th><th className="hide-phone">Joined</th><th></th></tr></thead>
                    <tbody>
                        {members.map((m) => {
                            const me = m.userId === session.userId;
                            return (
                                <tr key={m.userId}>
                                    <td>{m.email}{me && <span className="muted small"> (you)</span>}</td>
                                    <td>
                                        {isOwner ? (
                                            <select aria-label={"Role for " + m.email} value={m.role}
                                                onChange={(e) => void run(setRole(bar.id, m.userId, e.target.value as Role))}>
                                                <option value="owner">Owner</option>
                                                <option value="manager">Manager</option>
                                                <option value="staff">Staff</option>
                                            </select>
                                        ) : <span className="tag">{m.role}</span>}
                                    </td>
                                    <td className="hide-phone muted">{formatDate(m.joinedAt)}</td>
                                    <td className="num">
                                        {me ? (
                                            <button className="link-button" onClick={() => {
                                                if (confirm("Leave " + bar.name + "? You'll need a new invite to come back.")) {
                                                    void run(removeMember(bar.id, m.userId)).then((r) => r === null && location.reload());
                                                }
                                            }}>Leave</button>
                                        ) : isOwner && (
                                            <button className="link-button" onClick={() => confirm("Remove " + m.email + " from " + bar.name + "?") && void run(removeMember(bar.id, m.userId))}>
                                                Remove
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <dl className="role-notes card-pad">
                    {(["owner", "manager", "staff"] as Role[]).map((r) => (
                        <div key={r}><dt>{r}</dt><dd className="muted">{ROLE_NOTES[r]}</dd></div>
                    ))}
                </dl>
            </section>

            {canInvite && (
                <section className="card">
                    <h2>Or invite by email</h2>
                    <p className="muted small">
                        They join as soon as they make an Agave account with this email (or sign in, if they have one).
                        Agave doesn't email them yet, so the link above is quicker.
                    </p>
                    <form className="invite-form" onSubmit={sendInvite}>
                        <label className="form-field">
                            <span>Email</span>
                            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                        </label>
                        <label className="form-field">
                            <span>Role</span>
                            <select value={role} onChange={(e) => setNewRole(e.target.value as Role)}>
                                <option value="staff">Staff</option>
                                {isOwner && <option value="manager">Manager</option>}
                            </select>
                        </label>
                        <button type="submit">Invite</button>
                    </form>
                    {invites.length > 0 && (
                        <>
                            <h3>Waiting to join</h3>
                            <ul className="invite-list">
                                {invites.map((i) => (
                                    <li key={i.id}>
                                        <span>{i.email} <span className="tag">{i.role}</span></span>
                                        <button className="link-button" onClick={() => void run(cancelInvite(i.id))}>Cancel</button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </section>
            )}

            <section className="card">
                <h2>Another location</h2>
                <p className="muted small">Run more than one bar? Each gets its own recipes, stock and team. Switch between them from the top bar.</p>
                <form className="invite-form" onSubmit={makeBar}>
                    <label className="form-field">
                        <span>New bar's name</span>
                        <input value={newBar} maxLength={100} onChange={(e) => setNewBar(e.target.value)} />
                    </label>
                    <button type="submit" className="secondary">Create bar</button>
                </form>
            </section>
        </div>
    );
}
