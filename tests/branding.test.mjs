import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Heracles branding preserves deployment and PWA identity contracts", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.name, "Heracles");
  assert.equal(manifest.short_name, "Heracles");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");

  const index = read("index.html");
  for (const expected of [
    'property="og:site_name" content="Heracles"',
    'property="og:title" content="Heracles | Evidence-aware training data"',
    "<title>Heracles | Evidence-aware training data</title>",
    'aria-label="Heracles home"',
    '<span class="brand-mark" aria-hidden="true">H</span>',
    "<strong>Heracles</strong>",
    "Heracles connects exercise performance",
    "<span>Heracles</span>",
  ]) assert.ok(index.includes(expected), `missing ${expected}`);
  const structuredData = JSON.parse(index.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)[1]);
  assert.deepEqual(
    structuredData["@graph"].map((entry) => entry.name),
    ["Heracles", "Heracles"],
  );
  assert.match(index, /https:\/\/neolorenzo\.github\.io\/Lorenzos-Lifting-Ledger\//);
  assert.doesNotMatch(index, /Lorenzo's Lifting Ledger|>Lifting Ledger</);

  const packageJson = JSON.parse(read("package.json"));
  const packageLock = JSON.parse(read("package-lock.json"));
  assert.equal(packageJson.name, "heracles");
  assert.equal(packageLock.name, packageJson.name);
  assert.equal(packageLock.packages[""].name, packageJson.name);
});
