// ===== Sheet.tsx =====
// A bottom sheet on phones, a centered box on computers. Escape or a tap outside closes it.

import { useEffect, type ReactNode } from "react";

export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    useEffect(() => {
        const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [onClose]);
    return (
        <div className="sheet-backdrop no-print" onClick={onClose}>
            <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
                <div className="sheet-handle" aria-hidden="true" />
                <div className="sheet-head">
                    <h2>{title}</h2>
                    <button className="icon-circle" aria-label="Close" onClick={onClose}>×</button>
                </div>
                {children}
            </div>
        </div>
    );
}
