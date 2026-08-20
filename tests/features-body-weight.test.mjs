import assert from "node:assert/strict";
import test from "node:test";

// Mock minimal DOM APIs needed for feature instantiation
globalThis.document = {
  querySelector() {
    return {
      addEventListener() {},
      textContent: "",
    };
  }
};

import { createBodyWeightFeature } from "../features/body-weight.js";

test("createBodyWeightFeature API signature is correct", () => {
  const mockOptions = {
    getClient: () => ({}),
    getUserId: () => "test-user-id",
    onInvalidateE1rmPresentations: () => {}
  };
  const feature = createBodyWeightFeature(mockOptions);
  assert.equal(typeof feature.ensureState, "function");
  assert.equal(typeof feature.getState, "function");
  assert.equal(typeof feature.loadSummary, "function");
  assert.equal(typeof feature.reset, "function");
  assert.equal(typeof feature.renderChart, "undefined");
  assert.equal(typeof feature.clearChart, "undefined");
  assert.equal(typeof feature.resolveOneRepMaxRange, "function");
  assert.equal(typeof feature.formatOneRepMaxRange, "function");
});

test("getState returns a safe snapshot of the empty state", () => {
  const mockOptions = {
    getClient: () => ({}),
    getUserId: () => "test-user-id",
    onInvalidateE1rmPresentations: () => {}
  };
  const feature = createBodyWeightFeature(mockOptions);
  const state = feature.getState();
  assert.equal(state.loaded, false);
  assert.equal(state.hasBodyWeight, false);
  assert.equal(state.storedRelativeEnabled, false);
  assert.equal(state.effectiveRelativeEnabled, false);
  assert.ok(state.weightByDate instanceof Map);
});

test("loads every paginated daily row so recent dashboard ranges and relative e1RM retain end-of-coverage dates", async () => {
  const firstDay = Date.UTC(2023, 0, 1);
  const rows = Array.from({ length: 1002 }, (_, index) => ({
    measured_on: new Date(firstDay + index * 86_400_000).toISOString().slice(0, 10),
    weight_kg: 80 + index / 1000,
    provenance: index === 0 || index === 1001 ? "measured" : "interpolated",
  }));
  const requestedRanges = [];
  const feature = createBodyWeightFeature({
    getClient: () => ({
      rpc() {
        return {
          range(from, to) {
            requestedRanges.push([from, to]);
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
          },
        };
      },
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({ data: { relative_e1rm_enabled: true }, error: null }); },
        };
      },
    }),
    getUserId: () => "test-user-id",
    onInvalidateE1rmPresentations: () => {},
  });

  const state = await feature.ensureState();
  const lastDate = rows.at(-1).measured_on;
  assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999]]);
  assert.equal(state.dailySeries.length, 1002);
  assert.equal(state.weightByDate.get(lastDate), rows.at(-1).weight_kg);
  assert.deepEqual(feature.resolveOneRepMaxRange({ low: 160, high: 160, performedOn: lastDate }), {
    available: true,
    relative: true,
    low: 160 / rows.at(-1).weight_kg,
    high: 160 / rows.at(-1).weight_kg,
    unit: "× BW",
  });
});

test("settings keeps coverage and shows the latest body-weight import time or no-import state", async () => {
  const originalDocument = globalThis.document;
  const elements = new Map(["#body-weight-count", "#body-weight-coverage", "#body-weight-last-imported", "#delete-body-weight", "#relative-e1rm-enabled", "#relative-e1rm-status"].map((selector) => [selector, { textContent: "", disabled: false, checked: false, addEventListener() {} }]));
  globalThis.document = { querySelector: (selector) => elements.get(selector) ?? null };
  const responseFor = (table, columns, options, ascending) => {
    if (table === "user_settings") return { data: { relative_e1rm_enabled: false }, error: null };
    if (table === "body_weight_measurements" && options?.head) return { count: 2, error: null };
    if (table === "body_weight_measurements") return { data: { measured_on: ascending ? "2026-08-01" : "2026-08-20" }, error: null };
    if (table === "data_imports") return { data: { imported_at: "2026-08-20T22:42:00Z" }, error: null };
    throw new Error(`Unexpected table ${table}`);
  };
  const client = {
    rpc() { return { range() { return Promise.resolve({ data: [], error: null }); } }; },
    from(table) {
      return { select(columns, options) {
        let ascending = true;
        const query = {
          eq() { return query; },
          order(_column, direction) { ascending = direction.ascending; return query; },
          limit() { return query; },
          maybeSingle() { return Promise.resolve(responseFor(table, columns, options, ascending)); },
          then(resolve, reject) { return Promise.resolve(responseFor(table, columns, options, ascending)).then(resolve, reject); },
        };
        return query;
      } };
    },
  };
  try {
    const feature = createBodyWeightFeature({ getClient: () => client, getUserId: () => "test-user-id", onInvalidateE1rmPresentations: () => {} });
    await feature.loadSummary();
    assert.match(elements.get("#body-weight-coverage").textContent, /2026.*to.*2026/);
    assert.match(elements.get("#body-weight-last-imported").textContent, /20.*2026/);
    assert.match(elements.get("#body-weight-last-imported").textContent, /:\d?42/);

    elements.get("#body-weight-last-imported").textContent = "";
    const noDataFeature = createBodyWeightFeature({ getClient: () => ({ ...client, from(table) {
      if (table !== "data_imports") return client.from(table);
      return { select() { return { eq() { return this; }, order() { return this; }, limit() { return this; }, maybeSingle() { return Promise.resolve({ data: null, error: null }); } }; } };
    } }), getUserId: () => "test-user-id", onInvalidateE1rmPresentations: () => {} });
    await noDataFeature.loadSummary();
    assert.equal(elements.get("#body-weight-last-imported").textContent, "Never imported");
  } finally {
    globalThis.document = originalDocument;
  }
});
