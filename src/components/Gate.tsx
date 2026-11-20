// ===== Gate.tsx =====
// Decides what to show before the app itself, from the session's mode:
//     loading      a short "Opening Agave…"
//     signed-out   sign in / create account
//     recovery     set a new password (from a reset email)
//     no-bar       set up a bar, or wait for an invite
//     local/ready  the app

import { useSession } from "../cloud/session";
import { BarSetupScreen, LoadingScreen, NewPasswordScreen, SignInScreen } from "../pages/AuthScreens";
import Layout from "./Layout";

export default function Gate() {
    const { mode } = useSession();
    if (mode === "loading") return <LoadingScreen />;
    if (mode === "signed-out") return <SignInScreen />;
    if (mode === "recovery") return <NewPasswordScreen />;
    if (mode === "no-bar") return <BarSetupScreen />;
    return <Layout />;
}
