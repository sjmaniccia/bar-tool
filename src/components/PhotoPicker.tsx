// ===== PhotoPicker.tsx =====
// Take or choose photos, with thumbnails and a Remove link on each.
// Used by invoice scanning (up to 4 pages) and recipe scanning (a stack of pages).

import { useEffect, useMemo } from "react";

interface Props {
    files: File[];
    onChange: (files: File[]) => void;
    onReject: (message: string) => void;     // something that wasn't a photo was chosen
    max: number;
    disabled?: boolean;
    pageWord?: string;                        // "Page" -> "Page 1", "Page 2"...
}

export default function PhotoPicker({ files, onChange, onReject, max, disabled = false, pageWord = "Page" }: Props) {
    // Thumbnails for the chosen photos (freed when they change)
    const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
    useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

    function add(list: FileList | null) {
        if (!list) return;
        const images = [...list].filter((f) => f.type.startsWith("image/"));
        const all = [...files, ...images];
        onChange(all.slice(0, max));
        if (images.length < list.length) onReject("Only photos can be scanned (a PDF can be screenshotted).");
        else if (all.length > max) onReject("Only " + max + " at a time. The rest weren't added.");
        else onReject("");
    }

    return (
        <>
            <label className="scan-drop">
                <input
                    type="file" accept="image/*" capture="environment" multiple hidden
                    disabled={disabled || files.length >= max}
                    onChange={(e) => { add(e.target.files); e.target.value = ""; }}
                />
                <span className="scan-drop-icon" aria-hidden="true">📷</span>
                <strong>{files.length === 0 ? "Take or choose photos" : files.length >= max ? "That's the most at once" : "Add more"}</strong>
                <span className="muted small">Up to {max} {max === 1 ? "photo" : "photos"}</span>
            </label>

            {files.length > 0 && (
                <div className="scan-thumbs">
                    {previews.map((url, i) => (
                        <figure key={url} className="scan-thumb">
                            <img src={url} alt={pageWord + " " + (i + 1)} />
                            <figcaption>
                                {pageWord} {i + 1}
                                <button className="link-button" disabled={disabled} onClick={() => onChange(files.filter((_, j) => j !== i))}>Remove</button>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            )}
        </>
    );
}
