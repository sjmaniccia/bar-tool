// ===== EditableTitle.tsx =====
// A page title edited right there (a recipe's name, a menu's name): tap it, type, press
// Enter (or tap away) to save. Read-only when you can't change it.
//     a long name wraps onto more lines (a text box that grows), it never gets cut off
//     an empty name puts the old one back
//     `fresh` (a brand-new one) starts with the name selected, ready to type over

import { useEffect, useRef, useState } from "react";
interface Props {
    value: string;
    onSave: (value: string) => void;
    readOnly?: boolean;
    fresh?: boolean;
    label: string;           // for screen readers: "Recipe name", "Menu name"
}

export default function EditableTitle({ value, onSave, readOnly = false, fresh = false, label }: Props) {
    const [text, setText] = useState(value);
    const box = useRef<HTMLTextAreaElement>(null);

    // WHEN the name changes elsewhere, show it
    useEffect(() => setText(value), [value]);

    // Grow to fit every line of the name, again whenever its width changes
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const fit = () => {
            el.style.height = "auto";
            el.style.height = el.scrollHeight + "px";
        };
        fit();
        const watch = new ResizeObserver(fit);
        watch.observe(el);
        void document.fonts?.ready.then(fit);
        return () => watch.disconnect();
    }, [text]);

    // A new recipe: ready to type its name
    useEffect(() => {
        if (fresh && box.current) {
            box.current.focus();
            box.current.select();
        }
    }, [fresh]);

    if (readOnly) return <h1>{value}</h1>;

    function save() {
        const name = text.replace(/\s+/g, " ").trim();
        if (name === "") return setText(value);
        if (name !== value) onSave(name);
    }

    return (
        <h1 className="title-edit">
            <textarea ref={box} rows={1} className="title-input" aria-label={label} value={text}
                onChange={(e) => setText(e.target.value.replace(/\n/g, ""))}
                onBlur={save}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
        </h1>
    );
}
