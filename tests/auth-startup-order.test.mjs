import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("initializes signed-in routing before auth can synchronously render a session", async () => {
  const app = await read("app.js");

  const pageTitlesIndex = app.indexOf("const PAGE_TITLES = Object.freeze(");
  const routingSetIndex = app.indexOf("const URL_BACKED_SIGNED_IN_PAGES = new Set(");
  const authCallbackIndex = app.indexOf("supabase.auth.onAuthStateChange");

  assert.notEqual(pageTitlesIndex, -1);
  assert.notEqual(routingSetIndex, -1);
  assert.notEqual(authCallbackIndex, -1);
  assert.ok(pageTitlesIndex < authCallbackIndex, "PAGE_TITLES must be initialized before auth startup");
  assert.ok(routingSetIndex < authCallbackIndex, "URL-backed page routing must be initialized before auth startup");

  const routingDeclaration = app.match(
    /const URL_BACKED_SIGNED_IN_PAGES = new Set\(\[[\s\S]*?\n\]\);/,
  )?.[0];
  const readSignedInPageFunction = app.match(
    /function readSignedInPageFromUrl\(\) \{[\s\S]*?\n\}/,
  )?.[0];

  assert.ok(routingDeclaration);
  assert.ok(readSignedInPageFunction);

  const startupEvents = [
    { index: routingSetIndex, source: routingDeclaration },
    { index: authCallbackIndex, source: "readSignedInPageFromUrl();" },
  ].sort((left, right) => left.index - right.index);

  const startupProbe = [
    'const window = { location: { search: "?page=live-session" } };',
    readSignedInPageFunction,
    ...startupEvents.map((event) => event.source),
  ].join("\n\n");

  assert.doesNotThrow(() => {
    runInNewContext(startupProbe, { URLSearchParams });
  });
});
