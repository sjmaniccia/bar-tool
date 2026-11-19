// ===== TextInput.tsx =====
// A text box that saves when you leave it or press Enter (like AmountInput, for words).
// Used for names, phone numbers, notes... anywhere a field is edited in place.

import { useEffect, useState } from "react";

interface Props {
    value: string;
    onSave: (value: string) => void;
    placeholder?: string;
    required?: boolean;     // IF true, an empty box puts the old value back
    multiline?: boolean;    // a bigger box for notes
    type?: "text" | "email" | "tel" | "date";
    className?: string;
    ariaLabel?: string;
    disabled?: boolean;
    list?: string;          // id of a <datalist> of suggestions
}

export default function TextInput({ value, onSave, placeholder, required = false, multiline = false, type = "text", className, ariaLabel, disabled, list }: Props) {
    const [text, setText] = useState(value);

    // WHEN the saved value changes elsewhere, show it
    useEffect(() => setText(value), [value]);

    // Save what was typed
    //     IF it's required and empty, put the old value back
    //     IF nothing changed, do nothing
    function save() {
        const cleaned = text.trim();
        if (required && cleaned === "") {
            setText(value);
            return;
        }
        if (cleaned !== value) onSave(cleaned);
    }

    if (multiline) {
        return (
            <textarea rows={3} className={className} value={text} placeholder={placeholder} aria-label={ariaLabel}
                disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={save} />
        );
    }
    return (
        <input type={type} className={className} value={text} placeholder={placeholder} aria-label={ariaLabel} disabled={disabled} list={list}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    );
}
