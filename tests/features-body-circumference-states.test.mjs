import assert from "node:assert/strict";
import test from "node:test";

import {
  BODY_CIRCUMFERENCE_MEASUREMENT_STATES,
  bodyCircumferenceMeasurementStatesForSite,
  createBodyCircumferenceFeature,
  getBodyCircumferenceInstruction,
  normalizeBodyCircumferenceDraft,
  selectBodyCircumferenceSeries,
} from "../features/body-circumference.js";

globalThis.document = {
  querySelector() { return null; },
};

test("only upper arms expose flexed circumference measurements", () => {
  assert.deepEqual(BODY_CIRCUMFERENCE_MEASUREMENT_STATES, ["relaxed", "flexed"]);
  assert.deepEqual(bodyCircumferenceMeasurementStatesForSite("upper_arm_left"), ["relaxed", "flexed"]);
  assert.deepEqual(bodyCircumferenceMeasurementStatesForSite("upper_arm_right"), ["relaxed", "flexed"]);
  assert.deepEqual(bodyCircumferenceMeasurementStatesForSite("waist"), ["relaxed"]);
  assert.deepEqual(bodyCircumferenceMeasurementStatesForSite("calf_left"), ["relaxed"]);
  assert.deepEqual(bodyCircumferenceMeasurementStatesForSite("unsupported"), []);
});

test("flexed upper-arm protocol is explicit and distinct from relaxed protocol", () => {
  const relaxed = getBodyCircumferenceInstruction("upper_arm_left", "relaxed");
  const flexed = getBodyCircumferenceInstruction("upper_arm_left", "flexed");

  assert.match(relaxed, /arm relaxed/i);
  assert.match(relaxed, /halfway between/i);
  assert.match(flexed, /90°/i);
  assert.match(flexed, /maximally flex/i);
  assert.match(flexed, /largest circumference/i);
  assert.match(flexed, /morning/i);
  assert.match(flexed, /fasted/i);
  assert.match(flexed, /tape/i);
  assert.notEqual(relaxed, flexed);
});

test("draft validation defaults to relaxed and rejects flexed non-upper-arm measurements", () => {
  const legacy = normalizeBodyCircumferenceDraft({
    site: "waist",
    measuredAt: "2026-09-15T07:30:00Z",
    circumferenceCm: 82.4,
  });
  assert.equal(legacy.measurementState, "relaxed");

  const flexed = normalizeBodyCircumferenceDraft({
    site: "upper_arm_right",
    measurementState: "flexed",
    measuredAt: "2026-09-15T07:35:00Z",
    circumferenceCm: 38.2,
  });
  assert.equal(flexed.measurementState, "flexed");

  assert.throws(() => normalizeBodyCircumferenceDraft({
    site: "waist",
    measurementState: "flexed",
    measuredAt: "2026-09-15T07:30:00Z",
    circumferenceCm: 82.4,
  }), /supported measurement state/i);

  assert.throws(() => normalizeBodyCircumferenceDraft({
    site: "upper_arm_left",
    measurementState: "pumped",
    measuredAt: "2026-09-15T07:30:00Z",
    circumferenceCm: 38,
  }), /supported measurement state/i);
});

test("relaxed and flexed upper-arm histories remain independent observed series", () => {
  const measurements = [
    { id: 1, site: "upper_arm_left", measurement_state: "relaxed", measured_at: "2026-09-01T08:00:00Z", circumference_cm: "36.5" },
    { id: 2, site: "upper_arm_left", measurement_state: "flexed", measured_at: "2026-09-01T08:01:00Z", circumference_cm: "39.0" },
    { id: 3, site: "upper_arm_left", measurement_state: "relaxed", measured_at: "2026-09-15T08:00:00Z", circumference_cm: "36.8" },
    { id: 4, site: "upper_arm_left", measurement_state: "flexed", measured_at: "2026-09-15T08:01:00Z", circumference_cm: "39.4" },
    { id: 5, site: "upper_arm_right", measurement_state: "flexed", measured_at: "2026-09-15T08:02:00Z", circumference_cm: "39.2" },
  ];

  assert.deepEqual(
    selectBodyCircumferenceSeries(measurements, "upper_arm_left", "relaxed").map((row) => row.id),
    [1, 3],
  );
  assert.deepEqual(
    selectBodyCircumferenceSeries(measurements, "upper_arm_left", "flexed").map((row) => row.id),
    [2, 4],
  );
  assert.deepEqual(selectBodyCircumferenceSeries(measurements, "waist", "flexed"), []);
});

function createMemoryClient(ownerId) {
  let nextId = 1;
  const rows = [];

  function query(operation, payload = null) {
    const filters = [];
    const builder = {
      select() { return builder; },
      eq(column, value) { filters.push([column, value]); return builder; },
      order() { return builder; },
      then(resolve, reject) {
        try {
          const matches = (row) => filters.every(([column, value]) => String(row[column]) === String(value));
          if (operation === "select") {
            return Promise.resolve({
              data: rows.filter(matches).map((row) => ({ ...row })),
              error: null,
            }).then(resolve, reject);
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
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              if (matches(rows[index])) rows.splice(index, 1);
            }
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

test("feature persists and corrects flexed observations without changing relaxed observations", async () => {
  const ownerId = "owner-one";
  const client = createMemoryClient(ownerId);
  const feature = createBodyCircumferenceFeature({ getClient: () => client, getUserId: () => ownerId });

  await feature.save({
    site: "upper_arm_left",
    measurementState: "relaxed",
    measuredAt: "2026-09-01T08:00:00Z",
    circumferenceCm: 36.5,
  });
  await feature.save({
    site: "upper_arm_left",
    measurementState: "flexed",
    measuredAt: "2026-09-01T08:01:00Z",
    circumferenceCm: 39,
  });

  let state = feature.getState();
  assert.equal(state.measurements.length, 2);
  assert.equal(selectBodyCircumferenceSeries(state.measurements, "upper_arm_left", "relaxed").length, 1);
  assert.equal(selectBodyCircumferenceSeries(state.measurements, "upper_arm_left", "flexed").length, 1);

  const flexed = state.measurements.find((row) => row.measurement_state === "flexed");
  await feature.save({
    site: "upper_arm_left",
    measurementState: "flexed",
    measuredAt: flexed.measured_at,
    circumferenceCm: 39.3,
  }, flexed.id);

  state = feature.getState();
  assert.equal(state.measurements.find((row) => row.id === flexed.id).circumference_cm, 39.3);
  assert.equal(state.measurements.find((row) => row.measurement_state === "relaxed").circumference_cm, 36.5);

  await feature.remove(flexed.id);
  state = feature.getState();
  assert.equal(state.measurements.length, 1);
  assert.equal(state.measurements[0].measurement_state, "relaxed");
});
