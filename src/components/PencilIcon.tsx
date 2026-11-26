// The one pencil used on every "edit this" button
export default function PencilIcon({ size = 17 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16z M14 6l4 4" />
        </svg>
    );
}
