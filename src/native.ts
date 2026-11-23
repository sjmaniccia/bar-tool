// ===== native.ts =====
// The few things that work differently inside the iPhone app (Capacitor) than in a browser.
//     isNative        true inside the App Store app
//     WEB_ADDRESS     where email links point: an email can't open the app directly,
//                     so confirm/reset links open the website, then you sign in in the app
//     startNative     hide the splash screen, match the status bar to light/dark mode
//     tap             a real haptic tap (iPhones ignore the browser's vibrate)
// In a browser every function here does nothing.
// FIXME: universal links, so invite links and email links open the app instead of Safari

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

export const isNative = Capacitor.isNativePlatform();

export const WEB_ADDRESS = "https://sjmaniccia.github.io/bar-tool/";

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
