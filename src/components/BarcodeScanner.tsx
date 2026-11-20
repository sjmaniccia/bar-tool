// ===== BarcodeScanner.tsx =====
// Scan a bottle's barcode with the phone or laptop camera.
//     Uses the browser's built-in BarcodeDetector (Chrome on Android, Edge, Chrome on Mac)
//     WHEN a code is seen, hand it to onScan and keep watching for the next bottle
//
// A USB or Bluetooth scanner doesn't need this: it types the code into the
// search box and presses Enter, like a keyboard.
//
// FIXME: Safari on iPhone has no BarcodeDetector yet. Add a fallback (e.g. the
// @zxing/browser package) so iPhones can scan with the camera too.

import { useEffect, useRef, useState } from "react";

// The browser's detector isn't in TypeScript's built-in types yet, so describe the bit we use
interface Detector {
    detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorClass = new (options: { formats: string[] }) => Detector;

export function cameraScanAvailable(): boolean {
    return typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
}

export default function BarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
    const video = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState("");
    // Keep the latest onScan in a ref, so a redraw doesn't restart the camera
    const scanned = useRef(onScan);
    scanned.current = onScan;

    // WHEN opened: start the back camera, then check a frame for barcodes 4 times a second
    // WHEN closed: stop the camera
    useEffect(() => {
        let stream: MediaStream | null = null;
        let timer = 0;
        let last = "";
        let lastAt = 0;
        const Barcode = (window as unknown as { BarcodeDetector: DetectorClass }).BarcodeDetector;
        const detector = new Barcode({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then((s) => {
                stream = s;
                if (video.current) {
                    video.current.srcObject = s;
                    void video.current.play();
                }
                timer = window.setInterval(async () => {
                    if (!video.current || video.current.readyState < 2) return;
                    const found = await detector.detect(video.current).catch(() => []);
                    const code = found[0]?.rawValue;
                    // The same bottle stays in view for a moment; only count it again after 2 seconds
                    if (code && (code !== last || Date.now() - lastAt > 2000)) {
                        last = code;
                        lastAt = Date.now();
                        scanned.current(code);
                    }
                }, 250);
            })
            .catch(() => setError("Couldn't open the camera. Check the browser's camera permission."));

        return () => {
            window.clearInterval(timer);
            stream?.getTracks().forEach((t) => t.stop());
        };
    }, []);

    return (
        <div className="scanner">
            {error ? <p className="error">{error}</p> : <video ref={video} muted playsInline className="scanner-video" />}
            <div className="button-row">
                <span className="muted small">Point at a barcode. Each scan adds one.</span>
                <button className="secondary" onClick={onClose}>Stop scanning</button>
            </div>
        </div>
    );
}
