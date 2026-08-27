export async function fetchRecentExerciseIds(supabase, userId, limit = 8) {
  if (!supabase || !userId) return [];

  try {
    const { data, error } = await supabase
      .from("session_exercises")
      .select(`
        exercise_id,
        workout_sessions!inner(
          id,
          owner_id,
          performed_on,
          status,
          created_at
        )
      `)
      .eq("workout_sessions.owner_id", userId)
      .eq("workout_sessions.status", "completed")
      .order("performed_on", { foreignTable: "workout_sessions", ascending: false })
      .order("created_at", { foreignTable: "workout_sessions", ascending: false })
      .order("id", { foreignTable: "workout_sessions", ascending: false })
      .limit(limit * 5);

    if (error || !data) return [];

    const uniqueIds = [];
    const seen = new Set();
    for (const row of data) {
      if (row.exercise_id && !seen.has(row.exercise_id)) {
        seen.add(row.exercise_id);
        uniqueIds.push(row.exercise_id);
        if (uniqueIds.length >= limit) break;
      }
    }
    return uniqueIds;
  } catch {
    return [];
  }
}

export async function fetchRecentGymIds(supabase, userId, limit = 3) {
  if (!supabase || !userId) return [];

  try {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("id, gym_id, performed_on, status, created_at")
      .eq("owner_id", userId)
      .eq("status", "completed")
      .not("gym_id", "is", null)
      .order("performed_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit * 5);

    if (error || !data) return [];

    const uniqueIds = [];
    const seen = new Set();
    for (const row of data) {
      if (row.gym_id && !seen.has(row.gym_id)) {
        seen.add(row.gym_id);
        uniqueIds.push(row.gym_id);
        if (uniqueIds.length >= limit) break;
      }
    }
    return uniqueIds;
  } catch {
    return [];
  }
}
