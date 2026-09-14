import test from "node:test";
import assert from "node:assert/strict";

import { createSessionStorage } from "../features/session/session-storage.js";
import { createSessionAutosave, SYNC_STATE } from "../features/session/session-autosave.js";

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 500;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

test("issue #48: same-set autosaves serialize so an older write cannot finish after a newer write", async () => {
  const storage = createSessionStorage();
  const firstWrite = deferred();
  const persisted = { weight: null };
  const payloads = [];
  let updateCalls = 0;

  const client = {
    from(table) {
      assert.equal(table, "exercise_sets");
      return {
        update(payload) {
          payloads.push({ ...payload });
          return {
            eq() {
              return {
                eq() {
                  return {
                    async select() {
                      updateCalls += 1;
                      if (updateCalls === 1) await firstWrite.promise;
                      Object.assign(persisted, payload);
                      return { data: [{ id: 1 }], error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const autosave = createSessionAutosave({
    getClient: () => client,
    getUserId: () => "user-1",
    storage,
  });

  autosave.queueSetEdit(100, 1, { weight: 80 }, 0);
  await waitFor(() => updateCalls === 1, "first autosave should enter the persistence layer");

  autosave.queueSetEdit(100, 1, { weight: 90 }, 0);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(updateCalls, 1, "newer same-set write must remain behind the older in-flight write");
  assert.equal(autosave.getSyncState(), SYNC_STATE.SAVING);
  assert.equal(storage.getPendingSetEdit(100, 1).fields.weight, 90);

  firstWrite.resolve();
  assert.equal(await autosave.flushPendingEdits(100), true);

  assert.deepEqual(payloads, [{ weight: 80 }, { weight: 90 }]);
  assert.equal(persisted.weight, 90, "latest user edit must be the final canonical value");
  assert.equal(storage.getPendingSetEdits(100).length, 0);
  assert.equal(autosave.getSyncState(), SYNC_STATE.SAVED);
});

test("issue #48: failure of an older in-flight generation does not overwrite a newer durable edit", async () => {
  const storage = createSessionStorage();
  const firstWrite = deferred();
  const payloads = [];
  let updateCalls = 0;

  const client = {
    from() {
      return {
        update(payload) {
          payloads.push({ ...payload });
          return {
            eq() {
              return {
                eq() {
                  return {
                    async select() {
                      updateCalls += 1;
                      if (updateCalls === 1) {
                        await firstWrite.promise;
                        return { data: null, error: new Error("older request failed") };
                      }
                      return { data: [{ id: 1 }], error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const autosave = createSessionAutosave({
    getClient: () => client,
    getUserId: () => "user-1",
    storage,
  });

  autosave.queueSetEdit(100, 1, { weight: 80 }, 0);
  await waitFor(() => updateCalls === 1, "first autosave should enter the persistence layer");
  autosave.queueSetEdit(100, 1, { weight: 90 }, 0);
  await new Promise((resolve) => setTimeout(resolve, 10));

  firstWrite.resolve();
  assert.equal(await autosave.flushPendingEdits(100), true);

  assert.deepEqual(payloads, [{ weight: 80 }, { weight: 90 }]);
  assert.equal(storage.getPendingSetEdits(100).length, 0);
  assert.equal(autosave.getSyncState(), SYNC_STATE.SAVED);
});
