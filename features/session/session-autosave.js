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

  async function persistSet(sessionId, setId, fields, version = null) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId) {
      if (!discardedSetIds.has(setId)) {
        storage.savePendingSetEdit(sessionId, setId, fields);
        setSyncState(SYNC_STATE.FAILED);
      }
      return false;
    }

    if (!getOnlineStatus()) {
      if (!discardedSetIds.has(setId)) {
        storage.savePendingSetEdit(sessionId, setId, fields);
        setSyncState(SYNC_STATE.OFFLINE);
      }
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

      const { error } = await supabase
        .from("exercise_sets")
        .update(updatePayload)
        .eq("id", setId)
        .eq("owner_id", userId);

      if (error) throw error;

      if (!discardedSetIds.has(setId)) {
        storage.removePendingSetEdit(sessionId, setId, version);
      }
      return true;
    } catch {
      if (!discardedSetIds.has(setId)) {
        storage.savePendingSetEdit(sessionId, setId, fields);
        return false;
      }
      return true;
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

      const timer = setTimeout(async () => {
        pendingTimers.delete(setId);
        if (discardedSetIds.has(setId)) {
          discardedSetIds.delete(setId);
          evaluateSyncState(sessionId);
          return;
        }
        const latest = storage.getPendingSetEdit(sessionId, setId);
        if (latest) {
          const req = persistSet(sessionId, setId, latest.fields, latest.version);
          pendingRequests.set(setId, req);
          try {
            await req;
          } finally {
            pendingRequests.delete(setId);
            if (discardedSetIds.has(setId)) {
              discardedSetIds.delete(setId);
            }
            evaluateSyncState(sessionId);
          }
        } else {
          evaluateSyncState(sessionId);
        }
      }, debounceMs);

      pendingTimers.set(setId, timer);
    },

    async flushPendingEdits(sessionId) {
      // Cancel all debounce timers and trigger immediate persist
      for (const [, timer] of pendingTimers) {
        clearTimeout(timer);
      }
      pendingTimers.clear();

      // Wait for any existing pending requests to complete first
      if (pendingRequests.size > 0) {
        await Promise.allSettled([...pendingRequests.values()]);
      }

      const pendingEdits = storage.getPendingSetEdits(sessionId);
      if (pendingEdits.length === 0) {
        evaluateSyncState(sessionId);
        return true;
      }

      if (!getOnlineStatus()) {
        setSyncState(SYNC_STATE.OFFLINE);
        return false;
      }

      setSyncState(SYNC_STATE.SAVING);
      const promises = pendingEdits.map(async (item) => {
        const req = persistSet(sessionId, item.setId, item.fields, item.version);
        pendingRequests.set(item.setId, req);
        try {
          return await req;
        } finally {
          pendingRequests.delete(item.setId);
        }
      });

      const results = await Promise.all(promises);
      const allSuccess = results.every(Boolean);
      evaluateSyncState(sessionId);
      return allSuccess && storage.getPendingSetEdits(sessionId).length === 0;
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
