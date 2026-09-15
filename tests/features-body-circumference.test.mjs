import assert from "node:assert/strict";
import test from "node:test";

import {
  BODY_CIRCUMFERENCE_PROTOCOL,
  BODY_CIRCUMFERENCE_SITES,
  createBodyCircumferenceFeature,
  normalizeBodyCircumferenceDraft,
  selectBodyCircumferenceSeries,
} from "../features/body-circumference.js";

globalThis.document = {
  querySelector() { return null; },
};

test("body circumference taxonomy is stable, bounded, and carries reproducible instructions", () => {
  const ids = BODY_CIRCUMFERENCE_SITES.map((site) => site.id);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.includes("waist"));
  assert.ok(ids.includes("chest"));
  assert.ok(ids.includes("upper_arm_left"));
  assert.ok(ids.includes("upper_arm_right"));
  assert.ok(BODY_CIRCUMFERENCE_SITES.every((site) => site.label && site.instruction.length > 20));
  assert.match(BODY_CIRCUMFERENCE_PROTOCOL, /morning/i);
  assert.match(BODY_CIRCUMFERENCE_PROTOCOL, /fasted/i);
  assert.match(BODY_CIRCUMFERENCE_PROTOCOL, /urinating/i);
  assert.match(BODY_CIRCUMFERENCE_PROTOCOL, /tape/i);
});

test("circumference drafts require a supported site, valid time, and finite positive centimetres", () => {
  const normalized = normalizeBodyCircumferenceDraft({
    site: "waist",
    measuredAt: "2026-09-15T07:30:00Z",
    circumferenceCm: "82.4",
  });
  assert.equal(normalized.site, "waist");
  assert.equal(normalized.measuredAt, "2026-09-15T07:30:00.000Z");
  assert.equal(normalized.circumferenceCm, 82.4);

  assert.throws(() => normalizeBodyCircumferenceDraft({ site: "custom", measuredAt: "2026-09-15T07:30:00Z", circumferenceCm: 82 }), /supported body site/i);
  assert.throws(() => normalizeBodyCircumferenceDraft({ site: "waist", measuredAt: "not-a-date", circumferenceCm: 82 }), /valid measurement date/i);
  assert.throws(() => normalizeBodyCircumferenceDraft({ site: "waist", measuredAt: "2026-09-15T07:30:00Z", circumferenceCm: 0 }), /greater than zero/i);
  assert.throws(() => normalizeBodyCircumferenceDraft({ site: "waist", measuredAt: "2026-09-15T07:30:00Z", circumferenceCm: Number.POSITIVE_INFINITY }), /finite number/i);
});

test("longitudinal series contains only actual observations for the selected site", () => {
  const measurements = [
    { id: 3, site: "waist", measured_at: "2026-09-15T08:00:00Z", circumference_cm: "82.1" },
    { id: 1, site: "waist", measured_at: "2026-09-01T08:00:00Z", circumference_cm: "83.0" },
    { id: 2, site: "chest", measured_at: "2026-09-08T08:00:00Z", circumference_cm: "105.0" },
  ];
  const series = selectBodyCircumferenceSeries(measurements, "waist");
  assert.deepEqual(series.map((row) => row.id), [1, 3]);
  assert.deepEqual(series.map((row) => row.circumference_cm), [83, 82.1]);
  assert.equal(series.length, 2, "no missing dates are fabricated between observations");
  assert.deepEqual(selectBodyCircumferenceSeries(measurements, "unsupported"), []);
});

function createMemoryClient(ownerId) {
  let nextId = 1;
  const rows = [];

  function query(operation, payload = null) {
    const filters = [];
    let ascending = true;
    const builder = {
      select() { return builder; },
      eq(column, value) { filters.push([column, value]); return builder; },
      order(_column, options = {}) { ascending = options.ascending !== false; return builder; },
      then(resolve, reject) {
        try {
          const matches = (row) => filters.every(([column, value]) => String(row[column]) === String(value));
          if (operation === "select") {
            const data = rows.filter(matches).map((row) => ({ ...row })).sort((a, b) => {
              const result = a.measured_at.localeCompare(b.measured_at) || a.id - b.id;
              return ascending ? result : -result;
            });
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          }
          if (operation === "insert") {
            rows.push({ id: nextId++, created_at: new Date().toISOString(), ...payload });
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          if (operation === "update") {
            for (const row of rows.filter(matches)) Object.assign(row, payload);
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          if (operation === "delete") {
            for (let index = rows.length - 1; index >= 0; index -= 1) if (matches(rows[index])) rows.splice(index, 1);
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          throw new Error(`Unsupported operation ${operation}`);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    };
    return builder;
  }

  return {
    rows,
    from(table) {
      assert.equal(table, "body_circumference_measurements");
      return {
        select() { return query("select"); },
        insert(payload) {
          assert.equal(payload.owner_id, ownerId);
          return query("insert", payload);
        },
        update(payload) { return query("update", payload); },
        delete() { return query("delete"); },
      };
    },
  };
}

test("feature creates, corrects, deletes, and reloads only owner-scoped observations", async () => {
  const ownerId = "owner-one";
  const client = createMemoryClient(ownerId);
  const feature = createBodyCircumferenceFeature({ getClient: () => client, getUserId: () => ownerId });

  await feature.save({ site: "waist", measuredAt: "2026-09-01T08:00:00Z", circumferenceCm: 83 });
  await feature.save({ site: "chest", measuredAt: "2026-09-01T08:05:00Z", circumferenceCm: 105.4 });
  await feature.save({ site: "waist", measuredAt: "2026-09-08T08:00:00Z", circumferenceCm: 82.7 });

  let state = feature.getState();
  assert.equal(state.measurements.length, 3);
  assert.ok(state.measurements.every((row) => row.owner_id === ownerId));

  const firstWaist = state.measurements.find((row) => row.site === "waist");
  await feature.save({ site: "waist", measuredAt: firstWaist.measured_at, circumferenceCm: 82.4 }, firstWaist.id);
  state = feature.getState();
  assert.equal(state.measurements.find((row) => row.id === firstWaist.id).circumference_cm, 82.4);

  const chest = state.measurements.find((row) => row.site === "chest");
  await feature.remove(chest.id);
  state = feature.getState();
  assert.equal(state.measurements.length, 2);
  assert.deepEqual(state.measurements.map((row) => row.site), ["waist", "waist"]);
  assert.equal(selectBodyCircumferenceSeries(state.measurements, "waist").length, 2);
});
