// ===== BrandMark.tsx =====
// The Agave mark: a seal with a dot in the middle (like a bottle cap seen from above)
// FIXME: draw an agave mark when the colors are revisited

export function BrandMark() {
    return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="24" cy="24" r="5" fill="currentColor" />
        </svg>
    );
}
