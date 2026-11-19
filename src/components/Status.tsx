// ===== Status.tsx =====
// A small colored badge for where something is in its process:
//     counts: open, closed     orders: draft, sent, received
//     invoices: unreconciled, reconciled, approved

const LABELS: Record<string, string> = {
    open: "Open",
    closed: "Closed",
    draft: "Draft",
    sent: "Sent",
    received: "Received",
    unreconciled: "Unreconciled",
    reconciled: "Reconciled",
    approved: "Approved"
};

// Which color each status gets (the colors live in styles.css)
const TONES: Record<string, string> = {
    open: "active", draft: "active", unreconciled: "active",
    sent: "waiting", reconciled: "waiting",
    closed: "done", received: "done", approved: "done"
};

export default function Status({ status }: { status: string }) {
    return <span className={"status status-" + (TONES[status] ?? "active")}>{LABELS[status] ?? status}</span>;
}
