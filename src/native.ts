// ===== native.ts =====
// The few things that work differently inside the iPhone app (Capacitor) than in a browser.
//     isNative        true inside the App Store app
//     WEB_ADDRESS     the website: the privacy page and Square's return address
//     APP_LINK        where email links point from inside the app: agave://auth opens Agave
//     onAppLink       runs when one of those links opens the app
//     startNative     hide the splash screen, match the status bar to light/dark mode
//     tap             a real haptic tap (iPhones ignore the browser's vibrate)
// In a browser every function here does nothing.
// FIXME: universal links (https links that open the app), so invite links shared by text open it too

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

export const isNative = Capacitor.isNativePlatform();

export const WEB_ADDRESS = "https://sjmaniccia.github.io/bar-tool/";

// Email links made in the app come back to the app (Info.plist registers "agave")
export const APP_LINK = "agave://auth";

// An agave:// link opened the app: hand its address to the caller
export function onAppLink(handle: (url: URL) => void) {
    if (!isNative) return;
    void App.addListener("appUrlOpen", ({ url }) => {
        try {
            const link = new URL(url);
            if (link.protocol === "agave:") handle(link);
        } catch { /* not a link we understand */ }
    });
}

// The privacy policy (public/privacy.html). In the app it opens in Safari.
export const PRIVACY_URL = isNative ? WEB_ADDRESS + "privacy.html" : "privacy.html";

// Dark text on a light app, light text on a dark one
export function syncStatusBar(dark: boolean) {
    if (!isNative) return;
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
}

export function startNative(dark: boolean) {
    if (!isNative) return;
    document.documentElement.classList.add("native");
    syncStatusBar(dark);
    void SplashScreen.hide().catch(() => {});
}

// "light" for a tick, "success" for a scan read or a step done
export function tap(kind: "light" | "success") {
    if (!isNative) return;
    const done = kind === "success"
        ? Haptics.notification({ type: NotificationType.Success })
        : Haptics.impact({ style: ImpactStyle.Light });
    void done.catch(() => {});
}
