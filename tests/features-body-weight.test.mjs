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
import { filterByRange, getDateRange } from "../analytics.js";

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
  assert.equal(typeof feature.renderChart, "function");
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
  const recentRange = getDateRange("4w", new Date(`${lastDate}T12:00:00Z`), rows.map((item) => ({ performed_on: item.measured_on })));
  const recentRows = filterByRange(state.dailySeries, recentRange, "measured_on");

  assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999]]);
  assert.equal(state.dailySeries.length, 1002);
  assert.equal(recentRows.at(-1).measured_on, lastDate);
  assert.equal(state.weightByDate.get(lastDate), rows.at(-1).weight_kg);
  assert.deepEqual(feature.resolveOneRepMaxRange({ low: 160, high: 160, performedOn: lastDate }), {
    available: true,
    relative: true,
    low: 160 / rows.at(-1).weight_kg,
    high: 160 / rows.at(-1).weight_kg,
    unit: "× BW",
  });
});
