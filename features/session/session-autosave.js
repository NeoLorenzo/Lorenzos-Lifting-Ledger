export const SYNC_STATE = Object.freeze({
  SAVED: "saved",
  SAVING: "saving",
  OFFLINE: "offline",
  FAILED: "failed",
});

export const SYNC_LABELS = Object.freeze({
  [SYNC_STATE.SAVED]: "Saved ✓",
  [SYNC_STATE.SAVING]: "Saving…",
  [SYNC_STATE.OFFLINE]: "Offline — saved on device",
  [SYNC_STATE.FAILED]: "Sync failed — retrying",
});

export function createSessionAutosave(options) {
  const { getClient, getUserId, storage, onSyncStateChange } = options;

  let currentSyncState = SYNC_STATE.SAVED;
  const pendingTimers = new Map();
  const pendingRequests = new Map();
  const discardedSetIds = new Set();

  function setSyncState(state) {
    currentSyncState = state;
    if (onSyncStateChange) {
      onSyncStateChange(state, SYNC_LABELS[state] || "");
    }
  }

  function getOnlineStatus() {
    return typeof navigator !== "undefined" && "onLine" in navigator ? navigator.onLine : true;
  }

  function evaluateSyncState(sessionId) {
    if (!getOnlineStatus()) {
      setSyncState(SYNC_STATE.OFFLINE);
      return;
    }
    if (pendingTimers.size > 0 || pendingRequests.size > 0) {
      setSyncState(SYNC_STATE.SAVING);
      return;
    }
    const pendingEdits = storage.getPendingSetEdits(sessionId);
    if (pendingEdits.length > 0) {
      setSyncState(SYNC_STATE.FAILED);
      return;
    }
    setSyncState(SYNC_STATE.SAVED);
  }

  function retainPendingSetEdit(sessionId, setId, fields) {
    if (discardedSetIds.has(setId)) return;
    if (!storage.getPendingSetEdit(sessionId, setId)) {
      storage.savePendingSetEdit(sessionId, setId, fields);
    }
  }

  async function persistSet(sessionId, setId, fields, version = null) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId) {
      retainPendingSetEdit(sessionId, setId, fields);
      setSyncState(SYNC_STATE.FAILED);
      return false;
    }

    if (!getOnlineStatus()) {
      retainPendingSetEdit(sessionId, setId, fields);
      setSyncState(SYNC_STATE.OFFLINE);
      return false;
    }

    setSyncState(SYNC_STATE.SAVING);

    try {
      const updatePayload = {};
      if (fields.weight !== undefined) {
        updatePayload.weight = fields.weight;
      }
      if (fields.reps !== undefined) {
        updatePayload.reps = fields.reps;
      }
      if (fields.is_warmup !== undefined) {
        updatePayload.is_warmup = fields.is_warmup === true;
        if (fields.is_warmup === true) {
          updatePayload.reported_rir_bucket = null;
          updatePayload.rir_source = null;
        }
      }
      if (fields.reported_rir_bucket !== undefined) {
        updatePayload.reported_rir_bucket = fields.reported_rir_bucket;
        updatePayload.rir_source = fields.reported_rir_bucket !== null
          ? (fields.rir_source || "user_entered")
          : null;
      }
      if (fields.rir_source !== undefined && updatePayload.rir_source === undefined) {
        updatePayload.rir_source = fields.rir_source;
      }

      if (Object.keys(updatePayload).length === 0) {
        if (!discardedSetIds.has(setId)) {
          storage.removePendingSetEdit(sessionId, setId, version);
        }
        return true;
      }

      const { data, error } = await supabase
        .from("exercise_sets")
        .update(updatePayload)
        .eq("id", setId)
        .eq("owner_id", userId)
        .select("id");

      if (error) throw error;

      if (!Array.isArray(data) || data.length !== 1) {
        return false;
      }

      if (!discardedSetIds.has(setId)) {
        storage.removePendingSetEdit(sessionId, setId, version);
      }
      return true;
    } catch {
      retainPendingSetEdit(sessionId, setId, fields);
      return discardedSetIds.has(setId);
    }
  }

  function enqueueSetPersist(sessionId, setId) {
    const previous = pendingRequests.get(setId) || Promise.resolve(true);
    const request = previous.catch(() => false).then(async () => {
      if (discardedSetIds.has(setId)) return true;
      const latest = storage.getPendingSetEdit(sessionId, setId);
      if (!latest) return true;
      return await persistSet(sessionId, setId, latest.fields, latest.version);
    });

    pendingRequests.set(setId, request);
    void request.finally(() => {
      if (pendingRequests.get(setId) !== request) return;
      pendingRequests.delete(setId);
      if (discardedSetIds.has(setId)) {
        discardedSetIds.delete(setId);
      }
      evaluateSyncState(sessionId);
    });

    return request;
  }

  async function waitForPendingRequests() {
    while (pendingRequests.size > 0) {
      await Promise.allSettled([...pendingRequests.values()]);
    }
  }

  return {
    abort() {
      for (const timer of pendingTimers.values()) {
        clearTimeout(timer);
      }
      pendingTimers.clear();
      pendingRequests.clear();
      discardedSetIds.clear();
      setSyncState(SYNC_STATE.SAVED);
    },

    discardPendingSet(sessionId, setId) {
      if (pendingTimers.has(setId)) {
        clearTimeout(pendingTimers.get(setId));
        pendingTimers.delete(setId);
      }
      discardedSetIds.add(setId);
      storage.removePendingSetEdit(sessionId, setId);
      evaluateSyncState(sessionId);
    },

    getSyncState() {
      return currentSyncState;
    },

    queueSetEdit(sessionId, setId, fields, debounceMs = 350) {
      // Re-enable if previously discarded
      discardedSetIds.delete(setId);

      // Coalesce locally immediately
      storage.savePendingSetEdit(sessionId, setId, fields);
      setSyncState(getOnlineStatus() ? SYNC_STATE.SAVING : SYNC_STATE.OFFLINE);

      if (pendingTimers.has(setId)) {
        clearTimeout(pendingTimers.get(setId));
      }

      const timer = setTimeout(() => {
        pendingTimers.delete(setId);
        if (discardedSetIds.has(setId)) {
          discardedSetIds.delete(setId);
          evaluateSyncState(sessionId);
          return;
        }
        if (storage.getPendingSetEdit(sessionId, setId)) {
          enqueueSetPersist(sessionId, setId);
        } else {
          evaluateSyncState(sessionId);
        }
      }, debounceMs);

      pendingTimers.set(setId, timer);
    },

    async flushPendingEdits(sessionId) {
      // Cancel all debounce timers; their durable edits will be persisted below.
      for (const [, timer] of pendingTimers) {
        clearTimeout(timer);
      }
      pendingTimers.clear();

      // Wait for every current per-set chain, including a newer generation that
      // may have been queued behind an older in-flight request.
      await waitForPendingRequests();

      const pendingEdits = storage.getPendingSetEdits(sessionId);
      if (pendingEdits.length === 0) {
        evaluateSyncState(sessionId);
        return pendingRequests.size === 0;
      }

      if (!getOnlineStatus()) {
        setSyncState(SYNC_STATE.OFFLINE);
        return false;
      }

      setSyncState(SYNC_STATE.SAVING);
      const results = await Promise.all(
        pendingEdits.map((item) => enqueueSetPersist(sessionId, item.setId))
      );

      // A queued request may have chained behind one of the writes above; do not
      // report success until every same-set tail is incapable of changing the row.
      await waitForPendingRequests();

      const allSuccess = results.every(Boolean);
      evaluateSyncState(sessionId);
      return allSuccess
        && pendingRequests.size === 0
        && storage.getPendingSetEdits(sessionId).length === 0;
    },

    async retryPendingWrites(sessionId) {
      if (!getOnlineStatus()) {
        setSyncState(SYNC_STATE.OFFLINE);
        return false;
      }
      return await this.flushPendingEdits(sessionId);
    },
  };
}
