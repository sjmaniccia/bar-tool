// ===== FillPicker.tsx =====
// Pick how full an open bottle is by tapping a drawing of it, in tenths.
// Faster than guessing "0.3" in your head, and every bartender reads it the same way.
//
//     The bottle is 10 bands stacked bottom (0.1) to top (1.0)
//     Tap a band -> that level is picked; the bands below it fill in
//     Tap "Empty" -> no partial bottle

import { useId, useState } from "react";

interface Props {
    value: number;                       // 0 to 0.9, the open bottle's level
    onPick: (level: number) => void;
    onClose: () => void;
}

// Outline: neck, shoulder, body (an SVG path: M = move, h/v = straight lines, q = curves)
const BOTTLE = "M32 4 h16 v28 q0 8 10 16 q8 6 8 16 v82 q0 6 -6 6 h-40 q-6 0 -6 -6 v-82 q0 -10 8 -16 q10 -8 10 -16 z";

const LEVELS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];   // top to bottom on screen

export default function FillPicker({ value, onPick, onClose }: Props) {
    // While hovering, preview that level; otherwise show the saved one
    const [hover, setHover] = useState<number | null>(null);
    const shown = hover ?? value;
    const clipId = useId();   // unique id, in case two pickers are on screen

    // The body of the bottle runs from y=150 (bottom) up to y=50 (shoulder), 10 px per tenth
    const BOTTOM = 150;
    const BAND = 10;

    return (
        <div className="fill-picker" role="group" aria-label="How full is the open bottle?">
            <svg viewBox="0 0 80 160" className="fill-bottle" onMouseLeave={() => setHover(null)}>
                {/* The bottle's shape, used to trim the liquid so it doesn't spill past the shoulders */}
                <defs><clipPath id={clipId}><path d={BOTTLE} /></clipPath></defs>
                {/* Liquid up to the picked level */}
                <rect x="0" y={BOTTOM - shown * 10 * BAND} width="80" height={shown * 10 * BAND + 4} className="fill-liquid" clipPath={"url(#" + clipId + ")"} />
                {/* Outline: neck, shoulder, body */}
                <path d={BOTTLE} className="fill-outline" />
                {/* Clickable bands, one per tenth */}
                {LEVELS.map((level) => (
                    <rect key={level} x="10" y={BOTTOM - level * 10 * BAND} width="60" height={BAND}
                        className="fill-band" onMouseEnter={() => setHover(level)} onClick={() => onPick(level)}>
                        <title>{Math.round(level * 10)}/10 full</title>
                    </rect>
                ))}
                {/* Tick marks at the quarters people think in */}
                {[0.25, 0.5, 0.75].map((t) => (
                    <line key={t} x1="62" x2="70" y1={BOTTOM - t * 10 * BAND} y2={BOTTOM - t * 10 * BAND} className="fill-tick" />
                ))}
            </svg>
            <div className="fill-side">
                <strong className="fill-value">{shown === 0 ? "Empty" : Math.round(shown * 10) + "/10"}</strong>
                <div className="fill-levels">
                    {LEVELS.map((level) => (
                        <button key={level} className={"fill-level" + (Math.abs(value - level) < 0.01 ? " active" : "")}
                            onClick={() => onPick(level)}>.{Math.round(level * 10)}</button>
                    ))}
                </div>
                <div className="button-row">
                    <button className="secondary" onClick={() => onPick(0)}>No open bottle</button>
                    <button className="secondary" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
}
