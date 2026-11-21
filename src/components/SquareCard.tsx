// ===== SquareCard.tsx =====
// The Square connection on the Sales page.
//     Not signed in    -> "sign in to connect" (the demo can't hold keys)
//     Not connected    -> Connect Square (owners and managers)
//     Connected        -> who it's connected to, when it last synced, Sync now, Disconnect
//
//     WHEN Square sends the owner back (#/sales?square=connected) -> say so and sync
//     WHEN the page opens and today hasn't synced in the last hour -> sync once by itself

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useSession } from "../cloud/session";
import { connectSquare, disconnectSquare, squareStatus, syncDue, syncSquare, type PosStatus } from "../cloud/pos";
import { formatDate } from "../data/utils";

const RETURN_MESSAGES: Record<string, string> = {
    connected: "Square is connected.",
    declined: "Square wasn't connected: the approval was cancelled.",
    expired: "That Connect link expired. Click Connect Square again.",
    error: "Square couldn't finish connecting. Try again, and check the function's logs in Supabase if it keeps failing."
};

export default function SquareCard() {
    const session = useSession();
    const bar = session.bar;
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState<PosStatus | null | undefined>(undefined);   // undefined = still loading
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);

    const load = useCallback(async () => {
        if (!bar) return;
        try {
            setStatus(await squareStatus(bar.id));
        } catch {
            setStatus(null);
            setNote({ text: "Couldn't check the Square connection. Has pos.sql been run in Supabase?", ok: false });
        }
    }, [bar]);

    async function sync() {
        if (!bar) return;
        setBusy(true);
        const result = await syncSquare(bar.id);
        setNote(typeof result === "string" ? { text: result, ok: false } : { text: result.message, ok: true });
        await load();
        setBusy(false);
    }

    // Coming back from Square, or opening the page with days missing
    useEffect(() => {
        void (async () => {
            await load();
            const back = params.get("square");
            if (back) {
                setNote({ text: RETURN_MESSAGES[back] ?? RETURN_MESSAGES.error, ok: back === "connected" });
                navigate("/sales", { replace: true });
                if (back === "connected") await sync();
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bar?.id]);

    useEffect(() => {
        if (status && !busy && syncDue()) void sync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    if (session.mode !== "ready" || !bar) {
        return (
            <section className="card pos-card">
                <h2>Square</h2>
                <p className="muted small">Sign in to connect Square, so sales come in by themselves. The demo keeps everything in this browser, so it can't hold POS keys.</p>
            </section>
        );
    }

    async function connect() {
        setBusy(true);
        const error = await connectSquare(bar!.id);
        if (error) {
            setNote({ text: error, ok: false });
            setBusy(false);
        }
    }

    async function disconnect() {
        if (!confirm("Disconnect Square? Sales already imported stay; new ones stop coming in.")) return;
        setBusy(true);
        const error = await disconnectSquare(bar!.id);
        setNote(error ? { text: error, ok: false } : { text: "Square disconnected.", ok: true });
        await load();
        setBusy(false);
    }

    return (
        <section className="card pos-card">
            <div className="card-header">
                <h2>Square</h2>
                {status && <span className="status status-active">Connected</span>}
            </div>
            {status === undefined && <p className="muted small">Checking…</p>}
            {status === null && (
                <>
                    <p className="muted small">
                        Connect your Square account and each day's sales come in by themselves, matched to your recipes.
                        Agave can only read sales and your item list; it can't change anything in Square.
                    </p>
                    <div className="button-row"><button disabled={busy} onClick={connect}>Connect Square</button></div>
                </>
            )}
            {status && (
                <>
                    <p className="small">
                        {status.merchantName ? <>Connected to <strong>{status.merchantName}</strong>. </> : "Connected. "}
                        <span className="muted">
                            {status.lastSyncedAt ? "Last synced " + formatDate(status.lastSyncedAt) + "." : "Not synced yet."}
                            {" "}One sales report per day, including today so far.
                        </span>
                    </p>
                    {status.lastError && <p className="error small">Last sync failed: {status.lastError}</p>}
                    <div className="button-row">
                        <button disabled={busy} onClick={sync}>{busy ? "Syncing…" : "Sync now"}</button>
                        <button className="secondary" disabled={busy} onClick={disconnect}>Disconnect</button>
                    </div>
                </>
            )}
            {note && <p className={note.ok ? "success" : "error"} role="status">{note.text}</p>}
            <p className="muted small pos-next">Toast is next. Until then, use the CSV import below.</p>
        </section>
    );
}
