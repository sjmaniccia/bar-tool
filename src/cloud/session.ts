// ===== session.ts =====
// Who's signed in, which bar is open, and how syncing is going.
// Screens read it with useSession(); it redraws them when anything changes.
//
//     MODE           what the app shows
//     local          no server set up, or "try the demo": data stays in this browser
//     loading        checking the sign-in
//     signed-out     the sign-in page
//     recovery       came from a "reset password" email: set a new password
//     no-bar         signed in but not in a bar yet: create one or wait for an invite
//     ready          signed in with a bar open and syncing

import { setMe } from "../data/me";
import { APP_LINK, isNative, onAppLink } from "../native";
import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { cloudEnabled, supabase, supabaseTransport } from "./client";
import { SyncEngine, type DataPort, type Role, type SyncStatus } from "./sync";
import { db, deviceData, emptyData, loadData, commit, setSaveHook, showData } from "../data/storage";
import { sampleData } from "../data/sampleData";
import type { Database } from "../data/types";

export type Mode = "local" | "loading" | "signed-out" | "recovery" | "no-bar" | "ready";

export interface BarInfo {
    id: string;
    name: string;
    role: Role;
}

export interface Session {
    mode: Mode;
    demo: boolean;              // chose "try without an account"
    email: string;
    userId: string;
    bars: BarInfo[];
    bar: BarInfo | null;
    sync: SyncStatus;
    notice: string;             // a one-time message, like "You joined Shady's Corner"
}

const DEMO_KEY = "agave.demo";
const BAR_KEY = "agave.bar";
const CACHE_PREFIX = "agave.cache.";
const JOIN_KEY = "agave.join";        // an invite link's code, kept until the person is signed in

let session: Session = {
    mode: cloudEnabled ? "loading" : "local",
    demo: false,
    email: "",
    userId: "",
    bars: [],
    bar: null,
    sync: { state: "saved", pending: 0, message: "" },
    notice: ""
};
let engine: SyncEngine | null = null;
const listeners = new Set<() => void>();

function set(changes: Partial<Session>) {
    session = { ...session, ...changes };
    for (const listener of listeners) listener();
}

export function useSession(): Session {
    return useSyncExternalStore(
        (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        () => session
    );
}

export function currentSession(): Session {
    return session;
}


// ===== Starting up =====

// Run once when the app opens
//     IF no server is set up, or the person chose the demo -> local mode
//     ELSE check for a signed-in person, and watch for sign-ins and sign-outs
export function startSession() {
    if (!cloudEnabled) return;
    // Opened from an invite link (?join=code): remember the code through sign-up
    const join = new URLSearchParams(location.search).get("join");
    if (join && /^[0-9a-f]{64}$/.test(join)) {
        write(JOIN_KEY, join);
        remove(DEMO_KEY);
        history.replaceState(null, "", location.pathname + location.hash);
    }
    if (read(DEMO_KEY) === "1") {
        set({ mode: "local", demo: true });
        return;
    }
    supabase!.auth.onAuthStateChange((event, auth) => {
        // Supabase asks that no other Supabase calls run inside this callback, so wait a tick
        setTimeout(() => {
            // A reset link sends PASSWORD_RECOVERY and a signed-in event together:
            //     stay on "set a new password" until one is saved (setNewPassword opens the bar)
            if (event === "PASSWORD_RECOVERY") {
                recovering = true;
                set({ mode: "recovery" });
            }
            else if (auth?.user && recovering) return;
            else if (auth?.user && (auth.user.id !== session.userId || session.mode === "loading" || session.mode === "signed-out")) void signedIn(auth.user);
            else if (!auth?.user && session.mode !== "local") signedOutLocally();
        }, 0);
    });
    onAppLink((link) => void openedFromAppLink(link));
    // Remove ?code=... from the address once the email link has signed someone in
    //     IF nobody got signed in by it -> the link was opened in a different browser
    //     than the one that asked (Supabase keeps half the key there) or it's expired
    if (location.search.includes("code=")) {
        void supabase!.auth.getSession().then(({ data }) => {
            if (!data.session) set({ notice: "That link has to be opened on the same phone or browser where you asked for it, within an hour. Ask for a new one there." });
        });
        setTimeout(() => history.replaceState(null, "", location.pathname + location.hash), 2000);
    }
}

// TRUE while a reset link is open and no new password is saved yet:
//     nothing may open the bar over the "set a new password" screen
let recovering = false;

// Someone signed in: join any bars that invited them, then open a bar
//     IF they came from an invite link -> join that bar and open it
//     IF a reset link arrives meanwhile -> stop (checked after each wait)
async function signedIn(user: User) {
    if (recovering) return;
    set({ mode: "loading", email: user.email ?? "", userId: user.id });
    setMe(user.id);
    await supabase!.rpc("accept_invites");
    if (recovering) return;
    const joinCode = read(JOIN_KEY);
    let joinedBar: string | null = null;
    if (joinCode) {
        remove(JOIN_KEY);
        const { data, error } = await supabase!.rpc("join_with_link", { link_code: joinCode });
        if (error) set({ notice: error.message });
        else joinedBar = data as string;
    }
    const bars = await loadBars();
    if (recovering) return;
    if (joinedBar) {
        write(BAR_KEY, joinedBar);
        const bar = bars.find((b) => b.id === joinedBar);
        if (bar) set({ notice: "You joined " + bar.name + ". Welcome to the team." });
    }
    const saved = bars.find((b) => b.id === read(BAR_KEY)) ?? bars[0] ?? null;
    if (saved === null) {
        set({ mode: "no-bar", bars });
        return;
    }
    set({ bars });
    await openBar(saved);
}

// The bars I belong to, with my role in each
async function loadBars(): Promise<BarInfo[]> {
    const { data, error } = await supabase!.from("members").select("role, bars(id, name)").eq("user_id", session.userId);
    if (error) throw error;
    return (data as unknown as { role: Role; bars: { id: string; name: string } }[])
        .map((m) => ({ id: m.bars.id, name: m.bars.name, role: m.role }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export async function refreshBars() {
    const bars = await loadBars();
    const bar = bars.find((b) => b.id === session.bar?.id) ?? session.bar;
    set({ bars, bar });
}


// ===== Opening a bar =====

// How the sync engine reads and saves the app's data
const port: DataPort = {
    get: () => db,
    show: (data) => showData(data),
    loadCache(barId) {
        const saved = read(CACHE_PREFIX + barId);
        if (saved === null) return null;
        try {
            const parsed = JSON.parse(saved) as { data: unknown; base: [string, string][] };
            return { data: loadData(JSON.stringify(parsed.data)), base: new Map(parsed.base) };
        } catch {
            return null;
        }
    },
    saveCache(barId, data, base) {
        // FIXME: localStorage holds about 5 MB; move the cache to IndexedDB if bars get bigger than that
        write(CACHE_PREFIX + barId, JSON.stringify({ data, base: [...base] }));
    }
};

// Stop syncing the old bar, show the new one, start syncing it
async function openBar(bar: BarInfo, startWith: Database | null = null) {
    engine?.stop();
    write(BAR_KEY, bar.id);
    showData(emptyData());
    const next = new SyncEngine(supabaseTransport, port, bar.id, bar.role, session.userId);
    next.onStatus = (sync) => set({ sync });
    engine = next;
    setSaveHook(() => next.changed());
    set({ mode: "ready", bar, sync: next.status });
    await next.start();
    // A new bar starting from sample data or this device's data: send it all up
    if (startWith !== null) {
        showData(startWith);
        commit();
    }
}

export async function switchBar(barId: string) {
    const bar = session.bars.find((b) => b.id === barId);
    if (bar && bar.id !== session.bar?.id) await openBar(bar);
}

export type StartWith = "empty" | "sample" | "device";

// Make a new place, with me as owner, and open it
//     recipesOnly -> a family's recipes: starts empty with costing hidden (data/place.ts)
export async function createBar(name: string, startWith: StartWith, recipesOnly = false): Promise<string | null> {
    const { data, error } = await supabase!.rpc("create_bar", { bar_name: name });
    if (error) return error.message;
    const bars = await loadBars();
    set({ bars });
    const bar = bars.find((b) => b.id === data)!;
    let start = startWith === "sample" ? sampleData() : startWith === "device" ? deviceData() : null;
    if (recipesOnly) {
        start = emptyData();
        start.placeSettings.push({ id: "place", recipesOnly: true });
    }
    await openBar(bar, start);
    return null;
}

export function clearNotice() {
    set({ notice: "" });
}

// The invite link this person opened, if they haven't signed in yet
export function pendingJoinCode(): string | null {
    return read(JOIN_KEY);
}

// Does this browser have data from before signing up (worth bringing along)?
export function hasDeviceData(): boolean {
    const data = deviceData();
    return data.recipes.length + data.products.length > 0;
}


// ===== Signing in and out =====

// Where email links send people back to (this page, without any #/page)
//     carrying an invite link's code, in case the email opens in another browser
//     In the iPhone app the links open the app itself (agave://auth), so a reset asked for
//     in the app finishes in the app, where the one-time key Supabase checks is kept
function returnAddress(): string {
    const join = read(JOIN_KEY);
    const here = isNative ? APP_LINK : location.origin + location.pathname;
    return here + (join ? "?join=" + join : "");
}

// An email link opened the app (agave://auth?code=...):
//     carry any invite code, then trade the link's code for a sign-in
//     (a reset link then shows "set a new password", same as on the website)
//     IF the link was already used or is too old -> say so on the sign-in screen
async function openedFromAppLink(link: URL) {
    const join = link.searchParams.get("join");
    if (join && /^[0-9a-f]{64}$/.test(join)) write(JOIN_KEY, join);
    const failed = link.searchParams.get("error_description");
    if (failed) {
        set({ notice: friendly(failed) });
        return;
    }
    const code = link.searchParams.get("code");
    if (!code) return;
    const { error } = await supabase!.auth.exchangeCodeForSession(code);
    if (error) set({ notice: "That link didn't work. It may have been used already, or it's over an hour old. Ask for a new one." });
}

export async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    return error ? friendly(error.message) : null;
}

// Returns an error, or "confirm" if they need to click the email link first
export async function signUp(email: string, password: string): Promise<string | null> {
    const { data, error } = await supabase!.auth.signUp({
        email: email.trim(), password, options: { emailRedirectTo: returnAddress() }
    });
    if (error) return friendly(error.message);
    return data.session === null ? "confirm" : null;
}

export async function sendPasswordReset(email: string): Promise<string | null> {
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: returnAddress() });
    return error ? friendly(error.message) : null;
}

export async function setNewPassword(password: string): Promise<string | null> {
    const { data, error } = await supabase!.auth.updateUser({ password });
    if (error) return friendly(error.message);
    recovering = false;
    if (data.user) await signedIn(data.user);
    return null;
}

// Sign out and wipe this bar's copy from the device (bar tablets are shared)
export async function signOut() {
    await supabase!.auth.signOut();
    signedOutLocally();
}

// The account is gone on the server: forget the sign-in here without asking the server
export async function signedOutAfterDeletion() {
    await supabase!.auth.signOut({ scope: "local" });
    signedOutLocally();
}

function signedOutLocally() {
    recovering = false;
    engine?.stop();
    engine = null;
    setSaveHook(null);
    for (const bar of session.bars) remove(CACHE_PREFIX + bar.id);
    remove(BAR_KEY);
    showData(deviceData());
    set({ mode: "signed-out", email: "", userId: "", bars: [], bar: null });
    setMe("");
}

// Use the app without an account (data stays in this browser)
export function startDemo() {
    write(DEMO_KEY, "1");
    setSaveHook(null);
    showData(deviceData());
    set({ mode: "local", demo: true });
}

export function leaveDemo() {
    remove(DEMO_KEY);
    set({ mode: "loading", demo: false });
    startSession();
    void supabase!.auth.getSession().then(({ data }) => {
        if (!data.session) set({ mode: "signed-out" });
    });
}

// Supabase's error messages, in plainer words
function friendly(message: string): string {
    if (/invalid login/i.test(message)) return "That email and password don't match.";
    if (/email not confirmed/i.test(message)) return "Confirm your email first: click the link we sent you.";
    if (/rate limit/i.test(message)) return "Too many emails sent for now. Try again in an hour.";
    if (/password should be/i.test(message)) return "Use a password of at least 8 characters.";
    return message;
}


// ===== localStorage, without crashing when it's blocked =====

function read(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch (error) { console.log("Couldn't save", key, error); }
}

function remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* nothing to do */ }
}
