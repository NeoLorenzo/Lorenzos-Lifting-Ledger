const CACHE_NAME = "lifting-ledger-v28";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=19",
  "./app.js?v=26",
  "./analytics.js",
  "./literature.js",
  "./config.js",
  "./manifest.webmanifest",
  "./robots.txt",
  "./sitemap.xml",
  "./icons/icon.svg",
  "./docs/CURRENT_LIMITATIONS_OF_MUSCLE_GROUP_MAPPING.md",
  "./docs/DESIGN_RULES.md",
  "./docs/MUSCLE_GROUP_TAXONOMY.md",
  "./docs/EXERCISE_MUSCLE_COMPOSITION.md",
  "./docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md",
  "./docs/MOVEMENT_PATTERN_COEFFICIENTS.md",
  "./docs/MOVEMENT_PATTERN_DATA_MODEL.md",
  "./docs/RESISTANCE_TRAINING_OUTCOME_STUDY_SELECTION_PROTOCOL.md",
  "./docs/WHY_THE_APP_DOES_NOT_TRACK_TONNAGE.md",
  "./docs/MOVEMENT_PATTERN_TO_MUSCLE_FUNCTION.md",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("./index.html"))),
  );
});
