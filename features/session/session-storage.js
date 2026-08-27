const STORAGE_PREFIX = "lifting_ledger_pending_set_";

function getStorageKey(sessionId, setId) {
  return `${STORAGE_PREFIX}${sessionId}_${setId}`;
}

export function createSessionStorage() {
  const inMemoryFallback = new Map();

  function isLocalStorageAvailable() {
    try {
      return typeof window !== "undefined" && "localStorage" in window && window.localStorage !== null;
    } catch {
      return false;
    }
  }

  return {
    savePendingSetEdit(sessionId, setId, fields) {
      if (!sessionId || !setId) return;
      const key = getStorageKey(sessionId, setId);
      const existing = this.getPendingSetEdit(sessionId, setId) || { sessionId, setId, fields: {}, version: 0 };
      const merged = {
        sessionId,
        setId,
        fields: { ...existing.fields, ...fields },
        version: (existing.version || 0) + 1,
        updatedAt: Date.now(),
      };

      if (isLocalStorageAvailable()) {
        try {
          window.localStorage.setItem(key, JSON.stringify(merged));
          return merged;
        } catch {
          // fall back to in-memory
        }
      }
      inMemoryFallback.set(key, merged);
      return merged;
    },

    getPendingSetEdit(sessionId, setId) {
      const key = getStorageKey(sessionId, setId);
      if (isLocalStorageAvailable()) {
        try {
          const raw = window.localStorage.getItem(key);
          if (raw) return JSON.parse(raw);
        } catch {
          // fallback
        }
      }
      return inMemoryFallback.get(key) || null;
    },

    getPendingSetEdits(sessionId) {
      const results = [];
      const prefix = `${STORAGE_PREFIX}${sessionId}_`;

      if (isLocalStorageAvailable()) {
        try {
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(prefix)) {
              const raw = window.localStorage.getItem(key);
              if (raw) results.push(JSON.parse(raw));
            }
          }
          return results;
        } catch {
          // fallback
        }
      }

      for (const [key, val] of inMemoryFallback) {
        if (key.startsWith(prefix)) results.push(val);
      }
      return results;
    },

    removePendingSetEdit(sessionId, setId, version = null) {
      const key = getStorageKey(sessionId, setId);
      if (version !== null && version !== undefined) {
        const existing = this.getPendingSetEdit(sessionId, setId);
        if (!existing) return;
        if ((existing.version || 0) > version) {
          // A newer edit arrived; do not remove
          return;
        }
      }

      if (isLocalStorageAvailable()) {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
      inMemoryFallback.delete(key);
    },

    clearPendingSessionEdits(sessionId) {
      const prefix = `${STORAGE_PREFIX}${sessionId}_`;
      if (isLocalStorageAvailable()) {
        try {
          const keysToRemove = [];
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(prefix)) keysToRemove.push(key);
          }
          for (const key of keysToRemove) window.localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
      for (const key of [...inMemoryFallback.keys()]) {
        if (key.startsWith(prefix)) inMemoryFallback.delete(key);
      }
    },
  };
}
