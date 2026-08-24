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

  function setSyncState(state) {
    currentSyncState = state;
    if (onSyncStateChange) {
      onSyncStateChange(state, SYNC_LABELS[state] || "");
    }
  }

  function getOnlineStatus() {
    return typeof navigator !== "undefined" && "onLine" in navigator ? navigator.onLine : true;
  }

  async function persistSet(sessionId, setId, fields) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId) {
      setSyncState(SYNC_STATE.FAILED);
      return;
    }

    if (!getOnlineStatus()) {
      storage.savePendingSetEdit(sessionId, setId, fields);
      setSyncState(SYNC_STATE.OFFLINE);
      return;
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
        storage.removePendingSetEdit(sessionId, setId);
        return;
      }

      const { error } = await supabase
        .from("exercise_sets")
        .update(updatePayload)
        .eq("id", setId)
        .eq("owner_id", userId);

      if (error) throw error;

      storage.removePendingSetEdit(sessionId, setId);
      if (pendingTimers.size === 0 && pendingRequests.size === 0) {
        setSyncState(SYNC_STATE.SAVED);
      }
    } catch {
      storage.savePendingSetEdit(sessionId, setId, fields);
      setSyncState(getOnlineStatus() ? SYNC_STATE.FAILED : SYNC_STATE.OFFLINE);
    }
  }

  return {
    abort() {
      for (const timer of pendingTimers.values()) {
        clearTimeout(timer);
      }
      pendingTimers.clear();
      pendingRequests.clear();
      setSyncState(SYNC_STATE.SAVED);
    },

    getSyncState() {
      return currentSyncState;
    },

    queueSetEdit(sessionId, setId, fields, debounceMs = 350) {
      // Coalesce locally immediately
      storage.savePendingSetEdit(sessionId, setId, fields);
      setSyncState(SYNC_STATE.SAVING);

      if (pendingTimers.has(setId)) {
        clearTimeout(pendingTimers.get(setId));
      }

      const timer = setTimeout(async () => {
        pendingTimers.delete(setId);
        const latest = storage.getPendingSetEdit(sessionId, setId);
        if (latest) {
          const req = persistSet(sessionId, setId, latest.fields);
          pendingRequests.set(setId, req);
          await req;
          pendingRequests.delete(setId);
        }
      }, debounceMs);

      pendingTimers.set(setId, timer);
    },

    async flushPendingEdits(sessionId) {
      // Cancel all debounce timers and trigger immediate persist
      for (const [setId, timer] of pendingTimers) {
        clearTimeout(timer);
      }
      pendingTimers.clear();

      const pendingEdits = storage.getPendingSetEdits(sessionId);
      if (pendingEdits.length === 0) {
        setSyncState(SYNC_STATE.SAVED);
        return;
      }

      setSyncState(SYNC_STATE.SAVING);
      const promises = pendingEdits.map((item) => persistSet(sessionId, item.setId, item.fields));
      await Promise.all(promises);
    },

    async retryPendingWrites(sessionId) {
      if (!getOnlineStatus()) {
        setSyncState(SYNC_STATE.OFFLINE);
        return;
      }
      await this.flushPendingEdits(sessionId);
    },
  };
}
