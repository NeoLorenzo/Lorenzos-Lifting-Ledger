import { isAnalyticalWorkingSet, isCompletedSet } from "../../set-model.js";

function formatDateShort(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
}

function formatWeightUnit(exerciseName) {
  return /\(Dumbbell\)/i.test(exerciseName ?? "") ? "kg per dumbbell" : "kg";
}

export function formatPreviousPerformanceSummary(historyRecord, exerciseName) {
  if (!historyRecord || !historyRecord.sets || historyRecord.sets.length === 0) {
    return {
      hasHistory: false,
      heading: "No previous performance on this machine.",
      setList: [],
    };
  }

  const unit = formatWeightUnit(exerciseName);
  const heading = `Last time on this machine — ${formatDateShort(historyRecord.performed_on)}`;
  const setList = historyRecord.sets.map((set) => {
    if (set.is_warmup) {
      const load = set.weight !== null ? `${set.weight} ${unit}` : "";
      const reps = set.reps !== null ? `${set.reps} reps` : "";
      return `Set ${set.set_number}: ${[load, reps, "Warm-up"].filter(Boolean).join(" · ")}`;
    }
    const load = set.weight !== null ? `${set.weight} ${unit}` : "—";
    const reps = set.reps !== null ? `${set.reps}` : "—";
    const rirLabel = set.reported_rir_bucket !== null && set.reported_rir_bucket !== undefined
      ? (Number(set.reported_rir_bucket) === 4 ? "4+ RIR" : `${set.reported_rir_bucket} RIR`)
      : null;
    return `Set ${set.set_number}: ${load} × ${reps}${rirLabel ? ` · ${rirLabel}` : ""}`;
  });

  return {
    hasHistory: true,
    heading,
    setList,
  };
}

export function formatPreviousSetBadge(previousSet) {
  if (!previousSet || !isCompletedSet(previousSet)) return "—";
  if (previousSet.is_warmup) {
    return previousSet.weight !== null && previousSet.reps !== null
      ? `${previousSet.weight} × ${previousSet.reps} (W)`
      : "Warm-up";
  }
  const weight = previousSet.weight !== null ? previousSet.weight : "—";
  const reps = previousSet.reps !== null ? previousSet.reps : "—";
  return `${weight} × ${reps}`;
}

export function createSessionHistoryContext(options) {
  const { getClient, getUserId } = options;
  const historyCache = new Map();

  function cacheKey(gymId, exerciseId, equipmentId) {
    return `${gymId}_${exerciseId}_${equipmentId || "none"}`;
  }

  return {
    clearCache() {
      historyCache.clear();
    },

    async fetchPreviousPerformance(gymId, exerciseId, equipmentId, excludeSessionId = null) {
      const supabase = getClient();
      const userId = getUserId();
      if (!supabase || !userId || !gymId || !exerciseId) return null;

      const key = cacheKey(gymId, exerciseId, equipmentId);
      if (historyCache.has(key)) {
        return historyCache.get(key);
      }

      let query = supabase
        .from("session_exercises")
        .select(`
          id,
          exercise_order,
          created_at,
          gym_equipment_id,
          workout_sessions!inner(
            id,
            owner_id,
            gym_id,
            performed_on,
            status,
            created_at
          ),
          exercise_sets(
            id,
            set_number,
            weight,
            reps,
            is_warmup,
            reported_rir_bucket,
            rir_source
          )
        `)
        .eq("workout_sessions.owner_id", userId)
        .eq("workout_sessions.gym_id", gymId)
        .eq("workout_sessions.status", "completed")
        .eq("exercise_id", exerciseId);

      if (equipmentId) {
        query = query.eq("gym_equipment_id", equipmentId);
      }

      if (excludeSessionId) {
        query = query.neq("session_id", excludeSessionId);
      }

      query = query
        .order("performed_on", { foreignTable: "workout_sessions", ascending: false })
        .order("created_at", { foreignTable: "workout_sessions", ascending: false })
        .order("id", { foreignTable: "workout_sessions", ascending: false })
        .order("exercise_order", { ascending: false })
        .order("id", { ascending: false })
        .limit(1);

      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        historyCache.set(key, null);
        return null;
      }

      const match = data[0];
      const sets = (match.exercise_sets || [])
        .filter(isCompletedSet)
        .sort((a, b) => a.set_number - b.set_number || a.id - b.id);

      const result = {
        sessionId: match.workout_sessions.id,
        performed_on: match.workout_sessions.performed_on,
        gymEquipmentId: match.gym_equipment_id,
        sets,
      };

      historyCache.set(key, result);
      return result;
    },
  };
}
