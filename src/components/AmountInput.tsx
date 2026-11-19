// ===== AmountInput.tsx =====
// A text box for amounts that accepts fractions ("1 1/2", "¾").
// It saves when you leave the box or press Enter, not on every keystroke,
// so typing "1 1/2" doesn't save "1" halfway through.

import { useEffect, useState } from "react";
import { formatFraction, parseAmount } from "../data/utils";

interface Props {
    value: number | null;
    onSave: (value: number | null) => void;
    allowBlank?: boolean;      // can the box be emptied (saves null)?
    money?: boolean;           // show as 12.00 instead of a fraction
    placeholder?: string;
    className?: string;
    ariaLabel?: string;
}

export default function AmountInput({ value, onSave, allowBlank = false, money = false, placeholder, className, ariaLabel }: Props) {
    const shown = value === null ? "" : money ? value.toFixed(2) : formatFraction(value);
    const [text, setText] = useState(shown);

    // WHEN the saved value changes elsewhere, show it
    useEffect(() => setText(shown), [shown]);

    // Save what was typed
    //     IF blank and blanks are allowed, save null
    //     IF it's not a number, put the old value back
    function save() {
        if (text.trim() === "" && allowBlank) {
            if (value !== null) onSave(null);
            return;
        }
        const parsed = parseAmount(text);
        if (isNaN(parsed) || parsed < 0) {
            setText(shown);
            return;
        }
        if (parsed !== value) onSave(parsed);
    }

    return (
        <input
            type="text"
            inputMode="decimal"
            className={className}
            value={text}
            placeholder={placeholder}
            aria-label={ariaLabel}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
    );
}
