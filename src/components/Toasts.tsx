// ===== Toasts.tsx =====
// Draws the pop-ups from feedback.ts at the bottom of the screen (above the tab bar on phones).

import { dismissToast, useToasts } from "../feedback";

export default function Toasts() {
    const toasts = useToasts();
    return (
        <div className="toasts no-print" aria-live="polite">
            {toasts.map((t) => (
                <div key={t.id} className={"toast " + t.tone} role="status">
                    <span className="toast-icon" aria-hidden="true">
                        {t.tone === "warn"
                            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 7v6M12 17v.5"></path></svg>
                            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>}
                    </span>
                    <span className="toast-text">
                        <strong>{t.title}</strong>
                        {t.sub && <span>{t.sub}</span>}
                    </span>
                    {t.action && (
                        <button className="toast-action" onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>
                    )}
                    <button className="toast-close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>×</button>
                </div>
            ))}
        </div>
    );
}
