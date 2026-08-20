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

function createChartDocument() {
  class Element {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = {};
      this.attributes = new Map();
      this.className = "";
      this.textContent = "";
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === "class") this.className = String(value);
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
  }
  const chart = new Element("div");
  const empty = new Element("div");
  return {
    chart,
    querySelector(selector) {
      if (selector === "#body-weight-chart") return chart;
      if (selector === "#body-weight-empty") return empty;
      return null;
    },
    createElement(tagName) { return new Element(tagName); },
    createElementNS(_namespace, tagName) { return new Element(tagName); },
  };
}

function findByClass(element, className) {
  return [element, ...element.children.flatMap((child) => findByClass(child, className))]
    .filter((candidate) => candidate.className?.split(" ").includes(className));
}

function renderBodyWeightChart(values, range) {
  const originalDocument = globalThis.document;
  const document = createChartDocument();
  globalThis.document = document;
  const feature = createBodyWeightFeature({ getClient: () => null, getUserId: () => null, onInvalidateE1rmPresentations: () => {} });
  feature.renderChart(values, range);
  globalThis.document = originalDocument;
  return document.chart;
}

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

test("4w chart renders accessible measured markers only, while keeping interpolated values in the line", () => {
  const chart = renderBodyWeightChart([
    { measured_on: "2026-08-03", weight_kg: 80, provenance: "measured" },
    { measured_on: "2026-08-10", weight_kg: 79.5, provenance: "interpolated" },
    { measured_on: "2026-08-17", weight_kg: 79, provenance: "measured" },
  ], { key: "4w", start: new Date("2026-08-03T00:00:00Z"), end: new Date("2026-08-30T00:00:00Z") });
  const markers = findByClass(chart, "body-weight-marker");

  assert.equal(markers.length, 2);
  assert.ok(markers.every((marker) => marker.className.includes("is-measured")));
  assert.match(markers[0].getAttribute("aria-label"), /Measured/);
  assert.ok(markers[0].getAttribute("aria-describedby")?.startsWith("body-weight-tooltip-"));
  assert.equal(findByClass(chart, "body-weight-line").length, 1);
});

test("longer dashboard ranges render the interpolated line without markers", () => {
  const values = [
    { measured_on: "2026-01-01", weight_kg: 80, provenance: "measured" },
    { measured_on: "2026-01-02", weight_kg: 79.9, provenance: "interpolated" },
    { measured_on: "2026-01-03", weight_kg: 79.8, provenance: "measured" },
  ];
  for (const key of ["8w", "12w", "6m", "all"]) {
    const chart = renderBodyWeightChart(values, { key, start: new Date("2026-01-01T00:00:00Z"), end: new Date("2026-02-28T00:00:00Z") });
    assert.equal(findByClass(chart, "body-weight-marker").length, 0, key);
  }
});

test("body-weight chart positions values by their UTC dates and renders both axes", () => {
  const chart = renderBodyWeightChart([
    { measured_on: "2026-08-03", weight_kg: 80, provenance: "measured" },
    { measured_on: "2026-08-04", weight_kg: 79.9, provenance: "interpolated" },
    { measured_on: "2026-08-30", weight_kg: 79, provenance: "measured" },
  ], { key: "4w", start: new Date("2026-08-03T00:00:00Z"), end: new Date("2026-08-30T00:00:00Z") });
  const line = findByClass(chart, "body-weight-line")[0];
  const xCoordinates = line.getAttribute("points").split(" ").map((point) => Number(point.split(",")[0]));

  assert.equal(xCoordinates[0], 0);
  assert.ok(Math.abs(xCoordinates[1] - (100 / 27)) < 1e-10);
  assert.equal(xCoordinates[2], 100);
  assert.equal(findByClass(chart, "body-weight-y-axis-label")[0].textContent, "Body weight (kg)");
  assert.ok(findByClass(chart, "body-weight-y-tick").length >= 4);
  assert.ok(findByClass(chart, "body-weight-x-tick").length >= 4);
});
