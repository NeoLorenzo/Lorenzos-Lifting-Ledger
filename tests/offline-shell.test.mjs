import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const staticImportPattern = /^\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']\s*;?/gm;

function normalizeModulePath(modulePath) {
  return path.posix.normalize(modulePath.replace(/\\/g, "/").replace(/^\.\//, ""));
}

function stripUrlSuffix(specifier) {
  return specifier.replace(/[?#].*$/, "");
}

function parseAppShell(serviceWorker) {
  const appShellMatch = serviceWorker.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(appShellMatch, "service-worker.js must declare a literal APP_SHELL array");

  return new Set(
    [...appShellMatch[1].matchAll(/["']([^"']+)["']/g)].map((match) => normalizeModulePath(stripUrlSuffix(match[1]))),
  );
}

function localStaticImports(source) {
  return [...source.matchAll(staticImportPattern)]
    .map((match) => stripUrlSuffix(match[1]))
    .filter((specifier) => specifier.startsWith("."));
}

test("precaches every local static module reachable from app.js", async () => {
  const serviceWorker = await readFile(new URL("service-worker.js", repositoryRoot), "utf8");
  const appShell = parseAppShell(serviceWorker);
  const visited = new Set();
  const pending = ["app.js"];

  while (pending.length > 0) {
    const importer = pending.pop();
    if (visited.has(importer)) continue;
    visited.add(importer);

    const source = await readFile(new URL(importer, repositoryRoot), "utf8");
    assert.ok(appShell.has(importer), `${importer} is reachable from app.js but missing from APP_SHELL`);

    for (const specifier of localStaticImports(source)) {
      const dependency = normalizeModulePath(path.posix.join(path.posix.dirname(importer), specifier));
      assert.ok(
        appShell.has(dependency),
        `${importer} statically imports ${specifier}, but ${dependency} is missing from APP_SHELL`,
      );
      if (!visited.has(dependency)) pending.push(dependency);
    }
  }
});
