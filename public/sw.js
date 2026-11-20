// ===== sw.js (service worker) =====
// Lets Agave open with no internet (a walk-in cooler, a basement stockroom).
// The browser runs this file in the background, between the app and the network.
//
//     THE PAGE (index.html)     network first: get the newest version,
//                               IF offline, use the saved copy
//     EVERYTHING ELSE           cache first: the built files have a hash in their
//     (scripts, styles, fonts)  name (index-a1b2c3.js), so a saved copy never goes stale
//
// The data itself is in localStorage, which works offline already.

const CACHE = "agave-v1";

// WHEN installed: save the page and icons right away, and take over without waiting
self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["./", "./index.html", "./manifest.webmanifest", "./favicon.svg"])));
    self.skipWaiting();
});

// WHEN a new version takes over: delete caches from older versions
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

    // The page: try the network, save what comes back, fall back to the saved copy
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
                    return response;
                })
                .catch(() => caches.match("./index.html"))
        );
        return;
    }

    // Everything else: the saved copy if there is one, otherwise fetch and save it
    event.respondWith(
        caches.match(request).then((saved) => saved ?? fetch(request).then((response) => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
        }))
    );
});
