import test from "node:test";
import assert from "node:assert/strict";

import { createSessionStorage } from "../features/session/session-storage.js";
import { createSessionFeature } from "../features/session/session-controller.js";
import { SYNC_STATE } from "../features/session/session-autosave.js";

function installBrowser(online = true) {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const listeners = new Map();

  const mockWindow = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
    },
  };

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: online },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: mockWindow,
  });

  return {
    window: mockWindow,
    setOnline(value) {
      globalThis.navigator.onLine = value;
    },
    restore() {
      if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
      else delete globalThis.navigator;
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
      else delete globalThis.window;
    },
  };
}

function createCancellationFixture({ online = true, update } = {}) {
  const browser = installBrowser(online);
  const storage = createSessionStorage();
  const syncTransitions = [];
  const updatePayloads = [];
  const rpcCalls = [];

  const client = {
    from(table) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        not() { return builder; },
        order() {
          if (table === "gyms") {
            return Promise.resolve({ data: [{ id: 10, name: "Gym A" }], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        limit() { return builder; },
        maybeSingle() {
          if (table === "workout_sessions") {
            return Promise.resolve({
              data: { id: 999, gym_id: 10, status: "in_progress", performed_on: "2026-09-08" },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        update(payload) {
          assert.equal(table, "exercise_sets");
          updatePayloads.push(payload);
          return {
            eq: () => ({
              eq: () => ({
                select: () => update
                  ? update(payload)
                  : Promise.resolve({ data: [{ id: 201 }], error: null }),
              }),
            }),
          };
        },
      };
      return builder;
    },
    rpc(fn, params) {
      rpcCalls.push({ fn, params });
      assert.equal(fn, "cancel_workout_session");
      return Promise.resolve({ data: null, error: new Error("Cancellation RPC failed") });
    },
  };

  const feature = createSessionFeature({
    getClient: () => client,
    getUserId: () => "user-test",
    storage,
    historyContext: {
      clearCache() {},
      fetchPreviousPerformance: async () => ({ sets: [] }),
    },
    ensureExerciseCatalogue: () => Promise.resolve([]),
    onSyncStateChange: (state, label) => syncTransitions.push({ state, label }),
  });

  return {
    browser,
    storage,
    syncTransitions,
    updatePayloads,
    rpcCalls,
    feature,
  };
}

function lastSyncState(fixture) {
  return fixture.syncTransitions.at(-1)?.state ?? null;
}

test("ISSUE 36: failed cancellation immediately reconciles retained edits when online", async () => {
  const fixture = createCancellationFixture();
  try {
    await fixture.feature.load();
    fixture.storage.savePendingSetEdit(999, 201, { weight: 100, reps: 8 });

    await fixture.feature.cancelSession();

    assert.deepEqual(fixture.rpcCalls, [{
      fn: "cancel_workout_session",
      params: { p_session_id: 999 },
    }]);
    assert.deepEqual(fixture.updatePayloads, [{ weight: 100, reps: 8 }]);
    assert.equal(fixture.storage.getPendingSetEdits(999).length, 0, "successful retry clears only the persisted pending edit");
    assert.equal(fixture.feature.getActiveSession()?.id, 999, "failed cancellation keeps the workout active");
    assert.match(fixture.feature.getErrorMessage(), /Could not cancel workout/);

    const retrySavingIndex = fixture.syncTransitions.findIndex(({ state }, index) => (
      index > 0 && state === SYNC_STATE.SAVING
    ));
    assert.notEqual(retrySavingIndex, -1, "retained edits re-enter the normal autosave path after abort");
    assert.equal(lastSyncState(fixture), SYNC_STATE.SAVED, "saved is truthful once reconciliation succeeds");
  } finally {
    fixture.browser.restore();
  }
});

test("ISSUE 36: failed cancellation never reports saved while retained edits still fail to sync", async () => {
  const fixture = createCancellationFixture({
    update: () => Promise.resolve({ data: null, error: new Error("Set write failed") }),
  });
  try {
    await fixture.feature.load();
    fixture.storage.savePendingSetEdit(999, 201, { weight: 102.5, reps: 7 });

    await fixture.feature.cancelSession();

    let pending = fixture.storage.getPendingSetEdits(999);
    assert.equal(pending.length, 1);
    assert.deepEqual(pending[0].fields, { weight: 102.5, reps: 7 });
    assert.equal(lastSyncState(fixture), SYNC_STATE.FAILED);
    assert.equal(fixture.feature.getActiveSession()?.id, 999);

    await fixture.feature.cancelSession();

    pending = fixture.storage.getPendingSetEdits(999);
    assert.equal(pending.length, 1, "repeated cancellation failures do not duplicate or clear pending edits");
    assert.deepEqual(pending[0].fields, { weight: 102.5, reps: 7 });
    assert.equal(fixture.updatePayloads.length, 2, "each failed cancellation re-enters the existing retry path once");
    assert.equal(lastSyncState(fixture), SYNC_STATE.FAILED, "abort's transient saved state is corrected before cancelSession resolves");
  } finally {
    fixture.browser.restore();
  }
});

test("ISSUE 36: offline cancellation failure stays pending and the existing online handler retries safely", async () => {
  const fixture = createCancellationFixture({ online: false });
  try {
    await fixture.feature.load();
    fixture.storage.savePendingSetEdit(999, 201, { weight: 80, reps: 10 });

    await fixture.feature.cancelSession();

    assert.equal(fixture.updatePayloads.length, 0, "offline recovery does not attempt a database write");
    assert.equal(fixture.storage.getPendingSetEdits(999).length, 1);
    assert.equal(lastSyncState(fixture), SYNC_STATE.OFFLINE);
    assert.equal(fixture.feature.getActiveSession()?.id, 999);

    fixture.browser.setOnline(true);
    fixture.browser.window.dispatchEvent({ type: "online" });
    await new Promise((resolve) => setTimeout(resolve, 5));

    assert.deepEqual(fixture.updatePayloads, [{ weight: 80, reps: 10 }]);
    assert.equal(fixture.storage.getPendingSetEdits(999).length, 0);
    assert.equal(lastSyncState(fixture), SYNC_STATE.SAVED);
  } finally {
    fixture.browser.restore();
  }
});
