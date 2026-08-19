const DAY_MS = 86_400_000;

export function parseBodyWeightDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value).trim());
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function parseCsvRows(text) {
  const source = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let fields = [];
  let field = "";
  let quoted = false;
  let rowNumber = 1;
  let rowStartedAt = 1;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
        if (character === "\n") rowNumber += 1;
      }
      continue;
    }
    if (character === '"' && field.length === 0) quoted = true;
    else if (character === '"') throw new Error(`Row ${rowStartedAt}: unexpected quote in unquoted field.`);
    else if (character === ",") {
      fields.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      fields.push(field);
      rows.push({ sourceRow: rowStartedAt, fields });
      fields = [];
      field = "";
      rowNumber += 1;
      rowStartedAt = rowNumber;
    } else field += character;
  }
  if (quoted) throw new Error(`Row ${rowStartedAt}: unterminated quoted field.`);
  if (field.length || fields.length) {
    fields.push(field);
    rows.push({ sourceRow: rowStartedAt, fields });
  }
  return rows;
}

function isHeader(fields) {
  const date = String(fields[0] ?? "").trim().toLowerCase();
  const weight = String(fields[1] ?? "").trim().toLowerCase();
  return date === "date" && /weight/.test(weight);
}

export function parseBodyWeightCsv(text) {
  const rows = parseCsvRows(text);
  const observations = [];
  const seenDates = new Map();
  let dataStarted = false;
  let headerHandled = false;

  for (const row of rows) {
    if (row.fields.every((field) => String(field).trim() === "")) continue;
    if (!dataStarted && !headerHandled && isHeader(row.fields)) {
      headerHandled = true;
      continue;
    }
    dataStarted = true;
    if (row.fields.length < 2) throw new Error(`Row ${row.sourceRow}: expected a date in column A and weight in column B.`);
    const measuredOn = parseBodyWeightDate(row.fields[0]);
    if (!measuredOn) throw new Error(`Row ${row.sourceRow}: date must be a valid calendar date in DD/MM/YYYY format.`);
    const rawWeight = String(row.fields[1]).trim();
    const weightKg = Number(rawWeight);
    if (rawWeight === "" || !Number.isFinite(weightKg) || weightKg <= 0) {
      throw new Error(`Row ${row.sourceRow}: weight must be a finite number greater than zero kilograms.`);
    }
    if (seenDates.has(measuredOn)) {
      throw new Error(`Row ${row.sourceRow}: duplicate date ${formatBodyWeightDate(measuredOn)} (first seen on row ${seenDates.get(measuredOn)}).`);
    }
    seenDates.set(measuredOn, row.sourceRow);
    observations.push({ sourceRow: row.sourceRow, measuredOn, weightKg });
  }
  if (!observations.length) throw new Error("The CSV contains no body-weight observations.");
  observations.sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  return { observations, preview: summarizeBodyWeightObservations(observations) };
}

export function summarizeBodyWeightObservations(observations) {
  const sorted = [...observations].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const earliestMeasuredOn = sorted[0]?.measuredOn ?? null;
  const latestMeasuredOn = sorted.at(-1)?.measuredOn ?? null;
  const inclusiveDays = earliestMeasuredOn && latestMeasuredOn
    ? Math.round((Date.parse(`${latestMeasuredOn}T00:00:00Z`) - Date.parse(`${earliestMeasuredOn}T00:00:00Z`)) / DAY_MS) + 1
    : 0;
  return {
    count: sorted.length,
    earliestMeasuredOn,
    latestMeasuredOn,
    interpolatedDayCount: Math.max(0, inclusiveDays - sorted.length),
  };
}

export function interpolateBodyWeight(observations) {
  const sorted = [...observations].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const series = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    series.push({ measuredOn: current.measuredOn, weightKg: Number(current.weightKg), provenance: "measured" });
    const next = sorted[index + 1];
    if (!next) continue;
    const currentTime = Date.parse(`${current.measuredOn}T00:00:00Z`);
    const nextTime = Date.parse(`${next.measuredOn}T00:00:00Z`);
    const daysBetween = Math.round((nextTime - currentTime) / DAY_MS);
    for (let offset = 1; offset < daysBetween; offset += 1) {
      series.push({
        measuredOn: new Date(currentTime + offset * DAY_MS).toISOString().slice(0, 10),
        weightKg: Number(current.weightKg) + (Number(next.weightKg) - Number(current.weightKg)) * (offset / daysBetween),
        provenance: "interpolated",
        previousMeasuredOn: current.measuredOn,
        previousWeightKg: Number(current.weightKg),
        nextMeasuredOn: next.measuredOn,
        nextWeightKg: Number(next.weightKg),
      });
    }
  }
  return series;
}

export function canonicalizeBodyWeightObservations(observations) {
  return observations.map(({ measuredOn, weightKg }) => `${measuredOn},${weightKg}`).join("\n");
}

export function formatBodyWeightDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}
