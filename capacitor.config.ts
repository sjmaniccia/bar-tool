// ===== capacitor.config.ts =====
// The iPhone app is the same web app (the "dist" folder from npm run build) inside a
// native shell. This file tells that shell what the app is called and where the files are.
//     appId   the App Store's permanent id for Agave: it can never change once uploaded
//     webDir  where vite puts the built app

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "com.getagaveapp.agave",
    appName: "Agave",
    webDir: "dist",
    ios: {
        contentInset: "never",      // the app handles the notch itself (safe-area CSS)
        scheme: "Agave"
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 600,
            backgroundColor: "#f7f6f2",
            showSpinner: false
        }
    }
};

export default config;
