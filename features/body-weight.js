import { canonicalizeBodyWeightObservations, formatBodyWeightDate, parseBodyWeightCsv } from "../body-weight.js";
import { resolveOneRepMaxRange } from "../relative-e1rm.js";
import { createLinearScale } from "../analytics.js";

const BODY_WEIGHT_RPC_PAGE_SIZE = 1000;

function formatDecimal(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatOneRepMaxValue(value, relative) {
  return Number(value).toLocaleString(undefined, relative
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 });
}

const DAY_MS = 86_400_000;

function utcDate(value) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value, days) {
  return new Date(value.getTime() + days * DAY_MS);
}

function addUtcMonths(value, months) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

function formatAxisDate(value, includeYear = false) {
  return new Intl.DateTimeFormat(undefined, {
    day: includeYear ? undefined : "numeric",
    month: "short",
    year: includeYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(value);
}

function getBodyWeightDateTicks(range) {
  const start = range?.start ? utcDate(range.start) : null;
  const end = range?.end ? utcDate(range.end) : null;
  if (!start || !end) return [];
  const days = Math.max(0, Math.round((end - start) / DAY_MS));
  const ticks = [];
  const addTick = (value) => {
    if (value >= start && value <= end && !ticks.some((tick) => tick.getTime() === value.getTime())) ticks.push(value);
  };
  const weekSteps = { "4w": 7, "8w": 14, "12w": 28 };
  if (weekSteps[range.key]) {
    for (let value = start; value <= end; value = addUtcDays(value, weekSteps[range.key])) addTick(value);
  } else {
    const monthStep = range?.key === "6m" ? 1 : days <= 365 ? 1 : days <= 730 ? 3 : days <= 1825 ? 6 : 12;
    for (let value = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); value <= end; value = addUtcMonths(value, monthStep)) addTick(value);
  }
  addTick(end);
  const includeYear = range.key === "all" || start.getUTCFullYear() !== end.getUTCFullYear();
  return ticks.sort((a, b) => a - b).map((value) => ({ value, label: formatAxisDate(value, includeYear) }));
}

async function sha256Hex(value) {
  const bytes = value instanceof ArrayBuffer ? value : new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeBodyWeightSeries(rows) {
  const measuredWeights = new Map(rows
    .filter((item) => (item.provenance ?? item.kind) === "measured")
    .map((item) => [item.measured_on, Number(item.weight_kg)]));
  return rows.map((item) => ({
    ...item,
    provenance: item.provenance ?? item.kind,
    previous_weight_kg: item.previous_weight_kg ?? measuredWeights.get(item.previous_measured_on) ?? null,
    next_weight_kg: item.next_weight_kg ?? measuredWeights.get(item.next_measured_on) ?? null,
  }));
}

async function fetchBodyWeightDailySeries(supabase) {
  const rows = [];
  for (let from = 0; ; from += BODY_WEIGHT_RPC_PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc("body_weight_daily_series")
      .range(from, from + BODY_WEIGHT_RPC_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < BODY_WEIGHT_RPC_PAGE_SIZE) return rows;
  }
}

export function createBodyWeightFeature(options) {
  const { getClient, getUserId, onInvalidateE1rmPresentations } = options;

  // DOM elements lookup
  const bodyWeightChart = document.querySelector("#body-weight-chart");
  const bodyWeightEmpty = document.querySelector("#body-weight-empty");
  const bodyWeightFile = document.querySelector("#body-weight-file");
  const bodyWeightImportForm = document.querySelector("#body-weight-import-form");
  const bodyWeightImportButton = document.querySelector("#body-weight-import-button");
  const bodyWeightPreview = document.querySelector("#body-weight-preview");
  const bodyWeightImportStatus = document.querySelector("#body-weight-import-status");
  const bodyWeightCount = document.querySelector("#body-weight-count");
  const bodyWeightCoverage = document.querySelector("#body-weight-coverage");
  const deleteBodyWeightButton = document.querySelector("#delete-body-weight");
  const relativeE1rmEnabledInput = document.querySelector("#relative-e1rm-enabled");
  const relativeE1rmStatus = document.querySelector("#relative-e1rm-status");

  // Feature-local state
  let pendingBodyWeightImport = null;
  let bodyWeightUserState = createEmptyBodyWeightUserState();

  // Register event listeners if DOM elements exist
  if (bodyWeightFile) {
    bodyWeightFile.addEventListener("change", previewBodyWeightFile);
  }
  if (bodyWeightImportForm) {
    bodyWeightImportForm.addEventListener("submit", importBodyWeightFile);
  }
  if (deleteBodyWeightButton) {
    deleteBodyWeightButton.addEventListener("click", deleteBodyWeightData);
  }
  if (relativeE1rmEnabledInput) {
    relativeE1rmEnabledInput.addEventListener("change", saveRelativeE1rmSetting);
  }

  function createEmptyBodyWeightUserState() {
    return {
      userId: null,
      loaded: false,
      loading: null,
      dailySeries: [],
      weightByDate: new Map(),
      hasBodyWeight: false,
      storedRelativeEnabled: false,
      effectiveRelativeEnabled: false,
    };
  }

  function resetBodyWeightUserState() {
    bodyWeightUserState = createEmptyBodyWeightUserState();
    if (relativeE1rmEnabledInput) {
      relativeE1rmEnabledInput.checked = false;
      relativeE1rmEnabledInput.disabled = true;
    }
    if (relativeE1rmStatus) {
      relativeE1rmStatus.textContent = "";
    }
  }

  async function previewBodyWeightFile() {
    pendingBodyWeightImport = null;
    if (bodyWeightImportButton) bodyWeightImportButton.disabled = true;
    if (bodyWeightPreview) bodyWeightPreview.hidden = true;
    const file = bodyWeightFile?.files?.[0];
    if (!file) return;
    try {
      const [text, bytes] = await Promise.all([file.text(), file.arrayBuffer()]);
      const parsed = parseBodyWeightCsv(text);
      pendingBodyWeightImport = {
        file,
        parsed,
        sourceSha256: await sha256Hex(bytes),
        canonicalSha256: await sha256Hex(canonicalizeBodyWeightObservations(parsed.observations)),
      };
      const { preview } = parsed;
      if (bodyWeightPreview) {
        bodyWeightPreview.textContent = `${preview.count.toLocaleString()} measured observations · ${formatBodyWeightDate(preview.earliestMeasuredOn)} to ${formatBodyWeightDate(preview.latestMeasuredOn)} · ${preview.interpolatedDayCount.toLocaleString()} missing dates will be interpolated`;
        bodyWeightPreview.hidden = false;
      }
      if (bodyWeightImportStatus) {
        bodyWeightImportStatus.textContent = "File validated. Review the preview, then import.";
      }
      if (bodyWeightImportButton) bodyWeightImportButton.disabled = false;
    } catch (error) {
      if (bodyWeightImportStatus) {
        bodyWeightImportStatus.textContent = `Could not validate CSV: ${error.message}`;
      }
    }
  }

  async function importBodyWeightFile(event) {
    event.preventDefault();
    const supabase = getClient();
    const activeUserId = getUserId();
    if (!pendingBodyWeightImport || !supabase || !activeUserId) return;
    if (bodyWeightImportButton) bodyWeightImportButton.disabled = true;
    if (bodyWeightImportStatus) bodyWeightImportStatus.textContent = "Importing measurements…";
    const { file, parsed, sourceSha256, canonicalSha256 } = pendingBodyWeightImport;
    const { error } = await supabase.rpc("import_body_weight", {
      p_source_file_name: file.name,
      p_source_sha256: sourceSha256,
      p_canonical_sha256: canonicalSha256,
      p_rows: parsed.observations.map((item) => ({ source_row: item.sourceRow, measured_on: item.measuredOn, weight_kg: item.weightKg })),
    });
    if (error) {
      if (bodyWeightImportStatus) {
        bodyWeightImportStatus.textContent = `Import failed: ${error.message}`;
      }
      if (bodyWeightImportButton) bodyWeightImportButton.disabled = false;
      return;
    }
    if (bodyWeightImportStatus) {
      bodyWeightImportStatus.textContent = `Imported ${parsed.preview.count.toLocaleString()} measured observations.`;
    }
    pendingBodyWeightImport = null;
    if (bodyWeightFile) bodyWeightFile.value = "";
    if (bodyWeightPreview) bodyWeightPreview.hidden = true;
    resetBodyWeightUserState();
    await ensureBodyWeightUserState(true);
    onInvalidateE1rmPresentations();
    await loadBodyWeightSummary();
  }

  async function deleteBodyWeightData() {
    const supabase = getClient();
    const activeUserId = getUserId();
    if (!supabase || !activeUserId || !window.confirm("Delete all of your body-weight measurements and body-weight import history? Your workouts and other data will not be changed.")) return;
    if (deleteBodyWeightButton) deleteBodyWeightButton.disabled = true;
    if (bodyWeightImportStatus) bodyWeightImportStatus.textContent = "Deleting body-weight data…";
    const { error } = await supabase.rpc("delete_body_weight_data");
    if (bodyWeightImportStatus) {
      bodyWeightImportStatus.textContent = error ? `Deletion failed: ${error.message}` : "Your body-weight dataset has been deleted.";
    }
    if (error) {
      if (deleteBodyWeightButton) deleteBodyWeightButton.disabled = false;
      return;
    }
    resetBodyWeightUserState();
    await ensureBodyWeightUserState(true);
    onInvalidateE1rmPresentations();
    await loadBodyWeightSummary();
  }

  async function ensureBodyWeightUserState(force = false) {
    const supabase = getClient();
    const requestedUserId = getUserId();
    if (!requestedUserId || !supabase) return createEmptyBodyWeightUserState();
    if (!force && bodyWeightUserState.loaded && bodyWeightUserState.userId === requestedUserId) return bodyWeightUserState;
    if (!force && bodyWeightUserState.loading && bodyWeightUserState.userId === requestedUserId) return bodyWeightUserState.loading;

    const loading = (async () => {
      const [seriesResult, settingsResult] = await Promise.all([
        fetchBodyWeightDailySeries(supabase),
        supabase.from("user_settings").select("relative_e1rm_enabled").eq("owner_id", requestedUserId).maybeSingle(),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (requestedUserId !== getUserId()) return createEmptyBodyWeightUserState();
      const dailySeries = normalizeBodyWeightSeries(seriesResult);
      const hasBodyWeight = dailySeries.length > 0;
      const storedRelativeEnabled = settingsResult.data?.relative_e1rm_enabled === true;
      bodyWeightUserState = {
        userId: requestedUserId,
        loaded: true,
        loading: null,
        dailySeries,
        weightByDate: new Map(dailySeries.map((item) => [item.measured_on, Number(item.weight_kg)])),
        hasBodyWeight,
        storedRelativeEnabled,
        effectiveRelativeEnabled: hasBodyWeight && storedRelativeEnabled,
      };
      renderRelativeE1rmSetting(bodyWeightUserState);
      return bodyWeightUserState;
    })();
    bodyWeightUserState = { ...createEmptyBodyWeightUserState(), userId: requestedUserId, loading };
    return loading;
  }

  function renderRelativeE1rmSetting(state = bodyWeightUserState) {
    if (relativeE1rmEnabledInput) {
      relativeE1rmEnabledInput.disabled = !state.hasBodyWeight;
      relativeE1rmEnabledInput.checked = state.hasBodyWeight && state.storedRelativeEnabled;
    }
    if (relativeE1rmStatus) {
      if (!state.hasBodyWeight) relativeE1rmStatus.textContent = "Import body-weight data to enable relative estimated 1RM.";
      else if (!relativeE1rmStatus.textContent.startsWith("Could not")) relativeE1rmStatus.textContent = "";
    }
  }

  async function saveRelativeE1rmSetting() {
    const supabase = getClient();
    const activeUserId = getUserId();
    if (!supabase || !activeUserId || !bodyWeightUserState.hasBodyWeight) {
      renderRelativeE1rmSetting();
      return;
    }
    const requestedUserId = activeUserId;
    const enabled = relativeE1rmEnabledInput ? relativeE1rmEnabledInput.checked : false;
    if (relativeE1rmEnabledInput) relativeE1rmEnabledInput.disabled = true;
    if (relativeE1rmStatus) relativeE1rmStatus.textContent = "Saving preference…";
    const { error } = await supabase.from("user_settings").upsert({
      owner_id: requestedUserId,
      relative_e1rm_enabled: enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: "owner_id" });
    if (error || requestedUserId !== getUserId()) {
      if (relativeE1rmStatus) {
        relativeE1rmStatus.textContent = `Could not save preference: ${error?.message ?? "Your session changed."}`;
      }
      renderRelativeE1rmSetting();
      return;
    }
    bodyWeightUserState.storedRelativeEnabled = enabled;
    bodyWeightUserState.effectiveRelativeEnabled = enabled && bodyWeightUserState.hasBodyWeight;
    if (relativeE1rmStatus) {
      relativeE1rmStatus.textContent = enabled ? "Relative estimated 1RM enabled." : "Absolute estimated 1RM enabled.";
    }
    if (relativeE1rmEnabledInput) relativeE1rmEnabledInput.disabled = false;
    onInvalidateE1rmPresentations();
  }

  async function loadBodyWeightSummary() {
    const supabase = getClient();
    const requestedUserId = getUserId();
    if (!requestedUserId || !supabase) return;
    const [bodyWeightState, countResult, firstResult, lastResult] = await Promise.all([
      ensureBodyWeightUserState(),
      supabase.from("body_weight_measurements").select("id", { count: "exact", head: true }).eq("owner_id", requestedUserId),
      supabase.from("body_weight_measurements").select("measured_on").eq("owner_id", requestedUserId).order("measured_on", { ascending: true }).limit(1).maybeSingle(),
      supabase.from("body_weight_measurements").select("measured_on").eq("owner_id", requestedUserId).order("measured_on", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const error = countResult.error ?? firstResult.error ?? lastResult.error;
    if (error) {
      if (bodyWeightImportStatus) {
        bodyWeightImportStatus.textContent = `Could not load body-weight status: ${error.message}`;
      }
      return;
    }
    const count = countResult.count ?? 0;
    if (bodyWeightCount) bodyWeightCount.textContent = count.toLocaleString();
    if (bodyWeightCoverage) {
      bodyWeightCoverage.textContent = count ? `${formatBodyWeightDate(firstResult.data.measured_on)} to ${formatBodyWeightDate(lastResult.data.measured_on)}` : "No data";
    }
    if (deleteBodyWeightButton) deleteBodyWeightButton.disabled = count === 0;
    renderRelativeE1rmSetting(bodyWeightState);
  }

  function renderChart(values, range = null) {
    if (!bodyWeightChart) return;
    if (!values.length) {
      bodyWeightChart.replaceChildren();
      bodyWeightChart.removeAttribute("aria-label");
      if (bodyWeightEmpty) bodyWeightEmpty.hidden = false;
      return;
    }
    if (bodyWeightEmpty) bodyWeightEmpty.hidden = true;
    const scale = createLinearScale(values.map((item) => Number(item.weight_kg)), 6);
    const plot = document.createElement("div");
    plot.className = "body-weight-plot";
    const yAxisLabel = document.createElement("div");
    yAxisLabel.className = "body-weight-y-axis-label";
    yAxisLabel.textContent = "Body weight (kg)";
    const yAxis = document.createElement("div");
    yAxis.className = "body-weight-y-axis";
    for (const tick of scale.ticks) {
      const label = document.createElement("span");
      label.className = "body-weight-y-tick";
      label.style.bottom = `${scale.position(tick)}%`;
      label.textContent = formatDecimal(tick);
      yAxis.append(label);
    }
    const chartArea = document.createElement("div");
    chartArea.className = "body-weight-chart-area";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    const rangeStart = range?.start ? utcDate(range.start) : utcDate(values[0].measured_on);
    const rangeEnd = range?.end ? utcDate(range.end) : utcDate(values.at(-1).measured_on);
    const rangeDuration = rangeEnd.getTime() - rangeStart.getTime();
    const points = values.map((item) => ({
      item,
      x: rangeDuration > 0 ? ((utcDate(item.measured_on) - rangeStart) / rangeDuration) * 100 : 50,
      y: scale.position(Number(item.weight_kg)),
    }));
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("class", "body-weight-line");
    line.setAttribute("points", points.map((point) => `${point.x},${100 - point.y}`).join(" "));
    svg.append(line);
    chartArea.append(svg);
    for (const [index, point] of points.entries()) {
      if (range?.key !== "4w" || point.item.provenance !== "measured") continue;
      const marker = document.createElement("span");
      marker.className = "body-weight-marker is-measured";
      marker.style.left = `${point.x}%`;
      marker.style.bottom = `${point.y}%`;
      marker.tabIndex = 0;
      const kind = "Measured";
      marker.setAttribute("aria-label", `${formatBodyWeightDate(point.item.measured_on)}: ${formatDecimal(Number(point.item.weight_kg))} kg, ${kind}`);
      const tooltip = document.createElement("span");
      tooltip.id = `body-weight-tooltip-${index}`;
      tooltip.className = "progression-tooltip";
      tooltip.setAttribute("role", "tooltip");
      const detail = "Imported scale observation";
      tooltip.innerHTML = `<strong>${formatBodyWeightDate(point.item.measured_on)}</strong><span>${formatDecimal(Number(point.item.weight_kg))} kg · ${kind}</span><span>${detail}</span>`;
      marker.setAttribute("aria-describedby", tooltip.id);
      marker.append(tooltip);
      chartArea.append(marker);
    }
    const xAxis = document.createElement("div");
    xAxis.className = "body-weight-x-axis";
    for (const tick of getBodyWeightDateTicks(range)) {
      const label = document.createElement("span");
      label.className = "body-weight-x-tick";
      label.style.left = `${rangeDuration > 0 ? ((tick.value - rangeStart) / rangeDuration) * 100 : 50}%`;
      label.textContent = tick.label;
      xAxis.append(label);
    }
    plot.append(yAxisLabel, yAxis, chartArea, xAxis);
    bodyWeightChart.replaceChildren(plot);
    bodyWeightChart.setAttribute("aria-label", "Body weight in kilograms over time. Visible markers are measured observations; the daily connecting series is linearly interpolated between them without extrapolation.");
  }

  return {
    ensureState(force = false) {
      return ensureBodyWeightUserState(force);
    },
    getState() {
      return {
        loaded: bodyWeightUserState.loaded,
        dailySeries: bodyWeightUserState.dailySeries,
        weightByDate: new Map(bodyWeightUserState.weightByDate),
        hasBodyWeight: bodyWeightUserState.hasBodyWeight,
        storedRelativeEnabled: bodyWeightUserState.storedRelativeEnabled,
        effectiveRelativeEnabled: bodyWeightUserState.effectiveRelativeEnabled,
      };
    },
    loadSummary() {
      return loadBodyWeightSummary();
    },
    reset() {
      resetBodyWeightUserState();
    },
    renderChart(values, range = null) {
      renderChart(values, range);
    },
    clearChart() {
      if (bodyWeightChart) {
        bodyWeightChart.replaceChildren();
        bodyWeightChart.removeAttribute("aria-label");
      }
      if (bodyWeightEmpty) bodyWeightEmpty.hidden = true;
    },
    resolveOneRepMaxRange({ low, high, exerciseName, performedOn }) {
      return resolveOneRepMaxRange({
        low,
        high,
        exerciseName,
        performedOn,
        relativeEnabled: bodyWeightUserState.effectiveRelativeEnabled,
        weightByDate: bodyWeightUserState.weightByDate,
      });
    },
    formatOneRepMaxRange(low, high, exerciseName = "", performedOn = null) {
      const range = resolveOneRepMaxRange({
        low,
        high,
        exerciseName,
        performedOn,
        relativeEnabled: bodyWeightUserState.effectiveRelativeEnabled,
        weightByDate: bodyWeightUserState.weightByDate,
      });
      if (!range) return null;
      if (!range.available) return range.reason;
      const lowLabel = Number(range.low).toLocaleString(undefined, { maximumFractionDigits: 2 });
      const highLabel = Number(range.high).toLocaleString(undefined, { maximumFractionDigits: 2 });
      return lowLabel === highLabel
        ? `Estimated 1RM ${lowLabel} ${range.unit}`
        : `Estimated 1RM ${lowLabel}–${highLabel} ${range.unit}`;
    }
  };
}
