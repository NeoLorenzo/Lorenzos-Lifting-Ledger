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

export function formatInlinePreviousSet(previousSet, exerciseName) {
  if (!previousSet || !isCompletedSet(previousSet)) return null;
  const unit = formatWeightUnit(exerciseName);

  if (previousSet.is_warmup) {
    const load = previousSet.weight !== null && previousSet.weight !== undefined ? `${previousSet.weight} ${unit}` : "";
    const reps = previousSet.reps !== null && previousSet.reps !== undefined ? `${previousSet.reps}` : "";
    const core = load && reps ? `${load} × ${reps}` : (load || (reps ? `${reps} reps` : ""));
    return core ? `${core} (Warm-up)` : "Warm-up";
  }

  const load = previousSet.weight !== null && previousSet.weight !== undefined ? `${previousSet.weight} ${unit}` : "—";
  const reps = previousSet.reps !== null && previousSet.reps !== undefined ? `${previousSet.reps}` : "—";
  const rir = previousSet.reported_rir_bucket !== null && previousSet.reported_rir_bucket !== undefined
    ? ` @ ${Number(previousSet.reported_rir_bucket) === 4 ? "4+ RIR" : `${previousSet.reported_rir_bucket} RIR`}`
    : "";
  return `${load} × ${reps}${rir}`;
}

export function createSessionHistoryContext(options) {
  const { getClient, getUserId } = options;
  const historyCache = new Map();

  function cacheKey(userId, gymId, exerciseId, equipmentId, excludeSessionId) {
    return `${userId}_${gymId}_${exerciseId}_${equipmentId || "none"}_${excludeSessionId || "none"}`;
  }

  return {
    clearCache() {
      historyCache.clear();
    },

    async fetchPreviousPerformance(gymId, exerciseId, equipmentId, excludeSessionId = null) {
      const supabase = getClient();
      const userId = getUserId();
      if (!supabase || !userId || !gymId || !exerciseId) return null;

      const key = cacheKey(userId, gymId, exerciseId, equipmentId, excludeSessionId);
      if (historyCache.has(key)) {
        return historyCache.get(key);
      }

      let query = supabase
        .from("workout_sessions")
        .select(`
          id,
          created_at,
          performed_on,
          session_exercises!inner(
            id,
            exercise_order,
            gym_equipment_id,
            exercise_id,
            exercise_sets(
              id,
              set_number,
              weight,
              reps,
              is_warmup,
              reported_rir_bucket,
              rir_source
            )
          )
        `)
        .eq("owner_id", userId)
        .eq("gym_id", gymId)
        .eq("status", "completed")
        .eq("session_exercises.exercise_id", exerciseId);

      if (equipmentId) {
        query = query.eq("session_exercises.gym_equipment_id", equipmentId);
      }

      if (excludeSessionId) {
        query = query.neq("id", excludeSessionId);
      }

      query = query
        .order("performed_on", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1);

      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        historyCache.set(key, null);
        return null;
      }

      const session = data[0];
      const match = (session.session_exercises || [])
        .filter((exercise) => (
          exercise.exercise_id === exerciseId
          && (!equipmentId || exercise.gym_equipment_id === equipmentId)
        ))
        .sort((a, b) => b.exercise_order - a.exercise_order || b.id - a.id)[0];

      if (!match) {
        historyCache.set(key, null);
        return null;
      }

      const sets = (match.exercise_sets || [])
        .filter(isCompletedSet)
        .sort((a, b) => a.set_number - b.set_number || a.id - b.id);

      const result = {
        sessionId: session.id,
        performed_on: session.performed_on,
        gymEquipmentId: match.gym_equipment_id,
        sets,
      };

      historyCache.set(key, result);
      return result;
    },
  };
}
