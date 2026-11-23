// ===== feedback.ts =====
// The little rewards: toasts, sounds and a buzz when something gets done.
//
//     toast("Count closed", {sub, sound, action})   a pop-up at the bottom that goes away
//     celebrate("big")                              sound + buzz for the big moments
//
// Rules, so it stays fun instead of annoying:
//     only real work gets a sound (a scan read, a step done, a count closed); saves stay quiet
//     every sound is made here (no audio files to download), short and soft
//     Sounds, Haptics and Celebrations (Full / Subtle / Off) live in the profile menu
//     motion is skipped for people whose device asks for reduced motion
// Phones only allow sound after a tap, so the first tap anywhere "unlocks" it (Layout calls unlockSound).
// Buzz (vibrate) works on Android; iPhones don't let websites vibrate.

import { isNative, tap } from "./native";
import { useSyncExternalStore } from "react";

export type Sound = "none" | "tick" | "success" | "big" | "up" | "whoosh";
export type Celebrations = "full" | "subtle" | "off";

export interface Toast {
    id: number;
    title: string;
    sub: string;
    tone: "good" | "info" | "warn";
    action?: { label: string; run: () => void };
}


// ===== Settings =====

const KEYS = { sounds: "agave.sounds", haptics: "agave.haptics", celebrations: "agave.celebrations" };

function read(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* private mode: fine */ }
    for (const listener of settingsListeners) listener();
}

const settingsListeners = new Set<() => void>();
let settingsVersion = 0;
settingsListeners.add(() => { settingsVersion++; });

export function feedbackSettings() {
    return {
        sounds: read(KEYS.sounds) !== "off",
        haptics: read(KEYS.haptics) !== "off",
        celebrations: (read(KEYS.celebrations) as Celebrations | null) ?? "subtle"
    };
}

export function setSounds(on: boolean) { write(KEYS.sounds, on ? "on" : "off"); }
export function setHaptics(on: boolean) { write(KEYS.haptics, on ? "on" : "off"); }
export function setCelebrations(level: Celebrations) { write(KEYS.celebrations, level); }

export function useFeedbackSettings() {
    useSyncExternalStore(
        (l) => { settingsListeners.add(l); return () => settingsListeners.delete(l); },
        () => settingsVersion
    );
    return feedbackSettings();
}


// ===== Sound (made with the Web Audio API) =====

let audio: AudioContext | null = null;

// Call on a tap: phones only start sound from a person's action
export function unlockSound() {
    try {
        audio ??= new AudioContext();
        if (audio.state === "suspended") void audio.resume();
    } catch { /* no Web Audio: stay quiet */ }
}

// One soft note: a sine that fades in fast and out slowly
function note(frequency: number, start: number, length: number, volume: number) {
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const t = audio.currentTime + start;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + length + 0.05);
}

export function playSound(sound: Sound) {
    if (sound === "none" || !feedbackSettings().sounds || feedbackSettings().celebrations === "off") return;
    if (!audio || audio.state !== "running") return;
    if (sound === "tick") note(1760, 0, 0.06, 0.05);
    if (sound === "success") { note(659.25, 0, 0.25, 0.12); note(987.77, 0.11, 0.35, 0.1); }              // E5 then B5
    if (sound === "big") { note(523.25, 0, 0.3, 0.1); note(659.25, 0.1, 0.3, 0.1); note(783.99, 0.2, 0.3, 0.1); note(1046.5, 0.3, 0.5, 0.09); }
    if (sound === "up") { note(587.33, 0, 0.2, 0.09); note(880, 0.09, 0.3, 0.08); }
    if (sound === "whoosh") {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const t = audio.currentTime;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.18);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain).connect(audio.destination);
        osc.start(t);
        osc.stop(t + 0.25);
    }
}

export function buzz(pattern: number | number[]) {
    if (!feedbackSettings().haptics || feedbackSettings().celebrations === "off") return;
    // In the iPhone app: a real haptic (iPhones ignore vibrate). In a browser: vibrate (Android)
    if (isNative) return tap(Array.isArray(pattern) ? "success" : "light");
    try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

// The big moments: a scan read, costs appearing, a setup step done
//     full: sound + buzz + confetti dots; subtle: sound + buzz; off: nothing
export function celebrate(size: "small" | "big") {
    playSound(size === "big" ? "big" : "success");
    buzz(size === "big" ? [18, 60, 28] : 15);
}


// ===== Toasts =====

let toasts: Toast[] = [];
let nextId = 1;
const toastListeners = new Set<() => void>();

function setToasts(next: Toast[]) {
    toasts = next;
    for (const l of toastListeners) l();
}

// Show a pop-up for a few seconds (longer if it has a button)
export function toast(title: string, options: { sub?: string; sound?: Sound; tone?: Toast["tone"]; action?: Toast["action"] } = {}) {
    const id = nextId++;
    setToasts([...toasts.slice(-2), { id, title, sub: options.sub ?? "", tone: options.tone ?? "good", action: options.action }]);
    playSound(options.sound ?? "none");
    if (options.sound && options.sound !== "none" && options.sound !== "tick") buzz(12);
    setTimeout(() => dismissToast(id), options.action ? 6500 : 3800);
}

export function dismissToast(id: number) {
    setToasts(toasts.filter((t) => t.id !== id));
}

export function useToasts(): Toast[] {
    return useSyncExternalStore(
        (l) => { toastListeners.add(l); return () => toastListeners.delete(l); },
        () => toasts
    );
}
