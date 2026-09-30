import { isAnalyticalWorkingSet } from "../set-model.js";

// Fixed set-count bands keep a day's shade stable over time instead of
// rescaling whenever a new personal maximum is logged.
export const ACTIVITY_LEVEL_THRESHOLDS = [1, 8, 15, 22];
export const ACTIVITY_WEEKS = 53;

const DAY_MS = 24 * 60 * 60 * 1000;

function isoToUtc(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcToIso(time) {
  return new Date(time).toISOString().slice(0, 10);
}

export function toLocalIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Monday of the week `weeks - 1` weeks before the week containing `todayIso`.
export function activityCalendarStart(todayIso, weeks = ACTIVITY_WEEKS) {
  const today = isoToUtc(todayIso);
  const mondayOffset = (new Date(today).getUTCDay() + 6) % 7;
  return utcToIso(today - (mondayOffset + (weeks - 1) * 7) * DAY_MS);
}

export function activityLevel(count) {
  let level = 0;
  for (const threshold of ACTIVITY_LEVEL_THRESHOLDS) {
    if (count >= threshold) level += 1;
  }
  return level;
}

export function countWorkingSetsByDay(sessions) {
  const counts = new Map();
  for (const session of sessions ?? []) {
    if (!session?.performed_on) continue;
    const count = (session.session_exercises ?? []).reduce(
      (total, exercise) => total + (exercise.exercise_sets ?? []).filter(isAnalyticalWorkingSet).length,
      0,
    );
    if (count) counts.set(session.performed_on, (counts.get(session.performed_on) ?? 0) + count);
  }
  return counts;
}

export function buildActivityCalendar(countsByDay, todayIso, weeks = ACTIVITY_WEEKS) {
  const startIso = activityCalendarStart(todayIso, weeks);
  const start = isoToUtc(startIso);
  const today = isoToUtc(todayIso);
  const columns = [];
  const months = [];
  let total = 0;
  let activeDays = 0;

  for (let column = 0; column < weeks; column += 1) {
    const days = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const time = start + (column * 7 + weekday) * DAY_MS;
      if (time > today) break;
      const iso = utcToIso(time);
      const count = countsByDay.get(iso) ?? 0;
      total += count;
      if (count) activeDays += 1;
      days.push({ iso, weekday, count, level: activityLevel(count), isToday: time === today });
    }
    columns.push(days);

    const month = new Date(start + column * 7 * DAY_MS).getUTCMonth();
    const previousMonth = column ? new Date(start + (column - 1) * 7 * DAY_MS).getUTCMonth() : null;
    if (month !== previousMonth) months.push({ column, month });
  }

  // A partial first month would print its label on top of the next one.
  if (months.length > 1 && months[1].column - months[0].column < 3) months.shift();

  return { startIso, endIso: todayIso, columns, months, total, activeDays };
}
