export const SET_CLASS = Object.freeze({
  WARMUP: "warmup",
  WORKING: "working",
  HIGH_RIR: "high_rir",
});

export function classifySet(set) {
  if (set?.is_warmup === true) return SET_CLASS.WARMUP;
  return Number(set?.reported_rir_bucket) === 4 ? SET_CLASS.HIGH_RIR : SET_CLASS.WORKING;
}

export function isWorkingSet(set) {
  return classifySet(set) === SET_CLASS.WORKING;
}

export function isCompletedSet(set) {
  return !(set?.weight === null && set?.reps === null);
}

export function isAnalyticalWorkingSet(set) {
  return isWorkingSet(set) && isCompletedSet(set);
}

export function formatSetClassification(set) {
  const classification = classifySet(set);
  if (classification === SET_CLASS.WARMUP) return "Warm-up";
  if (classification === SET_CLASS.HIGH_RIR) return "4+ RIR — not counted as a working set";
  return `${Number(set.reported_rir_bucket)} RIR · Working set`;
}

function roundTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateBrzycki(weight, reps) {
  const load = Number(weight);
  const repetitions = Number(reps);
  if (!Number.isFinite(load) || load < 0 || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 36) return null;
  return roundTwo(load * 36 / (37 - repetitions));
}

export function calculateEpley(weight, reps) {
  const load = Number(weight);
  const repetitions = Number(reps);
  if (!Number.isFinite(load) || load < 0 || !Number.isInteger(repetitions) || repetitions < 1) return null;
  return roundTwo(load * (1 + repetitions / 30));
}

export function calculateRirE1rmEstimates(set) {
  if (!isAnalyticalWorkingSet(set)) return null;
  const rir = Number(set.reported_rir_bucket);
  if (!Number.isInteger(rir) || rir < 0 || rir > 3) return null;
  const observedBrzycki = calculateBrzycki(set.weight, set.reps);
  const observedEpley = calculateEpley(set.weight, set.reps);
  const adjustedBrzycki = calculateBrzycki(set.weight, Number(set.reps) + rir);
  const adjustedEpley = calculateEpley(set.weight, Number(set.reps) + rir);
  if ([observedBrzycki, observedEpley, adjustedBrzycki, adjustedEpley].some((value) => value === null)) return null;
  return { observedBrzycki, observedEpley, adjustedBrzycki, adjustedEpley };
}
