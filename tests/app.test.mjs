import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ships an installable app shell", async () => {
  const [html, manifest, serviceWorker] = await Promise.all([
    read("index.html"),
    read("manifest.webmanifest"),
    read("service-worker.js"),
  ]);

  assert.match(html, /rel="manifest"/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /Your lifts/);
  assert.doesNotMatch(html, /Hello world/i);
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(serviceWorker, /addEventListener\("fetch"/);
});

test("uses Google OAuth without privileged credentials", async () => {
  const [app, config] = await Promise.all([read("app.js"), read("config.js")]);
  const assignments = config
    .split("\n")
    .filter((line) => line.startsWith("export const"))
    .join("\n");

  assert.match(app, /provider: "google"/);
  assert.match(app, /flowType: "pkce"/);
  assert.match(app, /\.from\("lift_entries"\)/);
  assert.match(app, /lift_sets\(set_number, weight, reps\)/);
  assert.match(app, /supabase-js@\d+\.\d+\.\d+/);
  assert.doesNotMatch(app, /supabase-js@2(?:["/])/);
  assert.doesNotMatch(assignments, /service[_-]?role/i);
  assert.doesNotMatch(assignments, /client[_-]?secret/i);
});
