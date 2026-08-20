import {
  calculateExerciseSources,
  calculateExposureTrend,
  calculateMuscleExposure,
  calculatePercentageChange,
  chooseDefaultExercise,
  compareRecentPeriods,
  createLinearScale,
  filterByRange,
  getDateRange,
  getEquipmentSeriesKey,
  getGroupCatalogue,
  getRepeatedExercises,
  joinDashboardData,
  selectRepresentativeSetsBySeries,
  summarizeTraining,
  workingSets,
} from "../analytics.js";
import { calculateRirE1rmEstimates } from "../set-model.js";
import { resolveOneRepMaxEstimates } from "../relative-e1rm.js";

const E1RM_MODELS = Object.freeze([
  { key: "observedBrzycki", label: "Brzycki (completed reps)", dash: "" },
  { key: "observedEpley", label: "Epley (completed reps)", dash: "2 1" },
  { key: "adjustedBrzycki", label: "Brzycki (reps + RIR)", dash: "5 2" },
  { key: "adjustedEpley", label: "Epley (reps + RIR)", dash: "1 2" },
]);

const EXERCISE_SERIES_COLORS = Object.freeze([
  "#60a5fa", "#c084fc", "#f59e0b", "#22d3ee", "#f472b6",
  "#818cf8", "#fb923c", "#2dd4bf", "#eab308", "#a78bfa",
]);

export function createDashboardFeature(options) {
  const {
    getClient,
    getUserId,
    getActivePageName,
    ensureExerciseMuscleLookup,
    ensureBodyWeightState,
    getBodyWeightState,
    renderBodyWeightChart,
    clearBodyWeightChart,
  } = options;

  // DOM elements lookup
  const dashboardStatus = typeof document !== "undefined" ? document.querySelector("#dashboard-status") : null;
  const metricGrid = typeof document !== "undefined" ? document.querySelector("#metric-grid") : null;
  const rangeButtons = typeof document !== "undefined" ? [...document.querySelectorAll("[data-dashboard-range]")] : [];
  const dashboardContent = typeof document !== "undefined" ? document.querySelector("#dashboard-content") : null;
  const dashboardEmpty = typeof document !== "undefined" ? document.querySelector("#dashboard-empty") : null;
  const muscleExposureGrid = typeof document !== "undefined" ? document.querySelector("#muscle-exposure-grid") : null;
  const exposureWarning = typeof document !== "undefined" ? document.querySelector("#exposure-warning") : null;
  const muscleTrendTitle = typeof document !== "undefined" ? document.querySelector("#muscle-trend-title") : null;
  const muscleTrendChart = typeof document !== "undefined" ? document.querySelector("#muscle-trend-chart") : null;
  const exerciseSourcesTitle = typeof document !== "undefined" ? document.querySelector("#exercise-sources-title") : null;
  const exerciseSourcesList = typeof document !== "undefined" ? document.querySelector("#exercise-sources-list") : null;
  const progressionSelect = typeof document !== "undefined" ? document.querySelector("#progression-exercise") : null;
  const progressionStatus = typeof document !== "undefined" ? document.querySelector("#progression-status") : null;
  const progressionChart = typeof document !== "undefined" ? document.querySelector("#progression-chart") : null;
  const progressionHistory = typeof document !== "undefined" ? document.querySelector("#progression-history") : null;
  const recentOverview = typeof document !== "undefined" ? document.querySelector("#recent-overview") : null;
  const recentGroups = typeof document !== "undefined" ? document.querySelector("#recent-groups") : null;

  // Feature-local state
  let dashboardLoadedForUser = null;
  let dashboardLoadingForUser = null;
  let dashboardData = null;
  let dashboardRange = "8w";
  let selectedDashboardGroup = null;
  let selectedProgressionExercise = null;

  // Register event listeners
  for (const button of rangeButtons) {
    button.addEventListener("click", () => {
      dashboardRange = button.dataset.dashboardRange;
      renderDashboard();
    });
  }

  if (muscleExposureGrid) {
    muscleExposureGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-muscle-group]");
      if (!button) return;
      selectedDashboardGroup = button.dataset.muscleGroup;
      renderDashboard();
    });
  }

  if (progressionSelect) {
    progressionSelect.addEventListener("change", () => {
      selectedProgressionExercise = progressionSelect.value || null;
      renderExerciseProgression();
    });
  }

  async function fetchOwnedRows(supabase, table, columns, ownerId) {
    const batchSize = 1000;
    const rows = [];

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .eq("owner_id", ownerId)
        .order("id", { ascending: true })
        .range(rows.length, rows.length + batchSize - 1);

      if (error) throw error;
      rows.push(...data);
      if (data.length < batchSize) return rows;
    }
  }

  async function loadDashboard() {
    const supabase = getClient();
    const requestedUserId = getUserId();
    if (
      !requestedUserId ||
      !supabase ||
      dashboardLoadedForUser === requestedUserId ||
      dashboardLoadingForUser === requestedUserId
    ) return;

    dashboardLoadingForUser = requestedUserId;
    if (dashboardStatus) dashboardStatus.textContent = "Loading your dashboard…";

    try {
      const [sessions, exercises, sets, exerciseMuscleLookup] = await Promise.all([
        fetchOwnedRows(supabase, "workout_sessions", "id, performed_on, status", requestedUserId),
        fetchOwnedRows(supabase, "session_exercises", "id, session_id, exercise_id, equipment_id, exercises(name)", requestedUserId),
        fetchOwnedRows(
          supabase,
          "exercise_sets",
          "id, session_exercise_id, weight, reps, is_warmup, reported_rir_bucket, rir_source, estimated_1rm_brzycki, estimated_1rm_epley, estimated_1rm_brzycki_rir_adjusted, estimated_1rm_epley_rir_adjusted",
          requestedUserId,
        ),
        ensureExerciseMuscleLookup(supabase),
        ensureBodyWeightState(),
      ]);

      if (requestedUserId !== getUserId()) return;
      const completedSessions = sessions.filter((session) => session.status === "completed");
      const bodyWeights = getBodyWeightState().dailySeries;
      dashboardData = {
        sessions: completedSessions,
        records: joinDashboardData(completedSessions, exercises, sets),
        bodyWeights,
        exerciseMuscleLookup: exerciseMuscleLookup ?? new Map(),
      };
      renderDashboard();
      dashboardLoadedForUser = requestedUserId;
    } catch (error) {
      if (requestedUserId !== getUserId()) return;
      if (dashboardStatus) dashboardStatus.textContent = `Could not load your dashboard: ${error.message}`;
    } finally {
      if (dashboardLoadingForUser === requestedUserId) dashboardLoadingForUser = null;
    }
  }

  function renderDashboard() {
    if (!dashboardData) return;
    const { sessions, records, bodyWeights, exerciseMuscleLookup } = dashboardData;
    const rangeSources = [...sessions, ...bodyWeights.map((item) => ({ performed_on: item.measured_on }))];
    const range = getDateRange(dashboardRange, new Date(), rangeSources);
    const periodSessions = filterByRange(sessions, range);
    const periodRecords = filterByRange(records, range);
    const periodWorkingSets = workingSets(periodRecords);
    const groups = getGroupCatalogue(exerciseMuscleLookup);

    for (const button of rangeButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.dashboardRange === dashboardRange));
    }
    renderBodyWeightChart(filterByRange(bodyWeights, range, "measured_on"), range);

    if (!sessions.length) {
      showDashboardEmpty("No training data yet", "My Data will populate after you log your first training session.");
      if (dashboardStatus) dashboardStatus.textContent = "No workout data yet";
      return;
    }
    if (!periodSessions.length) {
      showDashboardEmpty("No sessions in this period", "Choose a different time range to inspect another part of your training history.");
      if (dashboardStatus) dashboardStatus.textContent = "No sessions in the selected period";
      return;
    }

    if (dashboardEmpty) dashboardEmpty.hidden = true;
    if (dashboardContent) dashboardContent.hidden = false;
    if (dashboardStatus) dashboardStatus.textContent = "";
    const summary = summarizeTraining(sessions, records, range);
    renderMetrics([
      { label: "Sessions", value: summary.sessions.toLocaleString() },
      { label: "Working sets", value: summary.workingSets.toLocaleString() },
      { label: "Average sessions / week", value: formatDecimal(summary.averageSessionsPerWeek) },
      { label: "Exercises trained", value: summary.exercises.toLocaleString() },
    ]);

    const exposure = calculateMuscleExposure(periodRecords, exerciseMuscleLookup, groups);
    const highestGroup = [...groups].sort((a, b) => (exposure.groupExposure.get(b.code) ?? 0) - (exposure.groupExposure.get(a.code) ?? 0))[0];
    if (!groups.some((group) => group.code === selectedDashboardGroup)) {
      selectedDashboardGroup = (exposure.groupExposure.get(highestGroup?.code) ?? 0) > 0 ? highestGroup.code : (groups.find((group) => group.code === "back")?.code ?? highestGroup?.code);
    }
    renderMuscleExposure(groups, exposure);
    if (exposureWarning) {
      if (!periodWorkingSets.length) {
        exposureWarning.hidden = false;
        exposureWarning.textContent = "This period contains sessions but no working sets. Warm-ups and 4+ RIR sets are excluded from these analytics.";
      }
    }
    renderSelectedMuscle(groups, exposure, periodRecords, range, exerciseMuscleLookup);

    const periodExercises = getRepeatedExercises(periodRecords);
    if (!periodExercises.some((exercise) => String(exercise.exercise_id) === String(selectedProgressionExercise))) selectedProgressionExercise = chooseDefaultExercise(periodRecords);
    renderProgressionOptions(periodExercises);
    renderExerciseProgression();
    renderRecentChange(groups, exerciseMuscleLookup);
  }

  function showDashboardEmpty(title, copy) {
    if (!dashboardContent || !dashboardEmpty) return;
    dashboardContent.hidden = true;
    dashboardEmpty.hidden = false;
    const heading = document.createElement("h2");
    heading.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = copy;
    dashboardEmpty.replaceChildren(heading, paragraph);
  }

  function renderMetrics(metrics) {
    if (!metricGrid) return;
    const fragment = document.createDocumentFragment();

    for (const metric of metrics) {
      const card = document.createElement("article");
      card.className = "metric-card";
      const label = document.createElement("p");
      label.className = "metric-label";
      label.textContent = metric.label;
      const value = document.createElement("p");
      value.className = "metric-value";
      value.textContent = metric.value;
      card.append(label, value);
      fragment.append(card);
    }

    metricGrid.replaceChildren(fragment);
  }

  function renderMuscleExposure(groups, exposure) {
    if (!muscleExposureGrid) return;
    const maximum = Math.max(...groups.map((group) => exposure.groupExposure.get(group.code) ?? 0), 1);
    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const value = exposure.groupExposure.get(group.code) ?? 0;
      const rawSets = exposure.groupRawSets.get(group.code) ?? 0;
      const expanded = group.code === selectedDashboardGroup;
      const item = document.createElement("div");
      item.className = `exposure-item muscle-group-${group.code}${expanded ? " is-expanded" : ""}`;

      const button = document.createElement("button");
      button.type = "button";
      button.className = `exposure-row muscle-group-${group.code}`;
      button.dataset.muscleGroup = group.code;
      button.setAttribute("aria-pressed", String(group.code === selectedDashboardGroup));
      button.setAttribute("aria-label", `${group.name}: ${formatExposure(value)} weighted sets from ${rawSets} working sets`);
      button.setAttribute("aria-expanded", String(expanded));
      button.setAttribute("aria-controls", `exposure-breakdown-${group.code}`);
      const label = document.createElement("span");
      label.className = "exposure-label";
      label.textContent = group.name;
      const track = document.createElement("span");
      track.className = "exposure-track";
      const bar = document.createElement("span");
      bar.className = "exposure-bar";
      bar.style.width = `${value ? Math.max(2, (value / maximum) * 100) : 0}%`;
      track.append(bar);
      const amount = document.createElement("span");
      amount.className = "exposure-value";
      amount.textContent = formatExposure(value);
      button.append(label, track, amount);
      item.append(button);
      if (expanded) {
        const breakdown = document.createElement("div");
        breakdown.id = `exposure-breakdown-${group.code}`;
        breakdown.className = "exposure-breakdown ranked-list";
        breakdown.setAttribute("aria-label", `${group.name} muscle breakdown`);
        const detailed = group.muscles.map((muscle) => ({ label: muscle.name, value: exposure.detailedExposure.get(muscle.name) ?? 0 }));
        renderRankedList(breakdown, detailed, "No detailed muscle exposure in this period.");
        item.append(breakdown);
      }
      fragment.append(item);
    }
    muscleExposureGrid.replaceChildren(fragment);
    if (exposureWarning) {
      const unmappedCount = exposure.unmappedExercises.size;
      exposureWarning.hidden = unmappedCount === 0;
      exposureWarning.textContent = unmappedCount ? `${unmappedCount} performed ${unmappedCount === 1 ? "exercise has" : "exercises have"} no current relevance mapping and is excluded from modelled exposure.` : "";
    }
  }

  function renderSelectedMuscle(groups, exposure, periodRecords, range, exerciseMuscleLookup) {
    const group = groups.find((item) => item.code === selectedDashboardGroup);
    if (!group) return;
    if (muscleTrendTitle) muscleTrendTitle.textContent = group.name;
    if (exerciseSourcesTitle) exerciseSourcesTitle.textContent = group.name;
    renderTrendChart(calculateExposureTrend(periodRecords, exerciseMuscleLookup, group.code, range), range);

    const sources = calculateExerciseSources(periodRecords, exerciseMuscleLookup, group.code).map((item) => ({ label: item.exercise_name, value: item.value }));
    if (exerciseSourcesList) renderRankedList(exerciseSourcesList, sources, "No exercises contributed modelled exposure to this group.");
  }

  function renderRankedList(container, values, emptyMessage) {
    if (!container) return;
    if (!values.length) {
      container.replaceChildren(createEmptyMessage(emptyMessage));
      return;
    }
    const maximum = Math.max(...values.map((item) => item.value), 1);
    const fragment = document.createDocumentFragment();
    for (const item of values) {
      const row = document.createElement("div");
      row.className = "ranked-row";
      row.setAttribute("aria-label", `${item.label}: ${formatExposure(item.value)} weighted sets`);
      const label = document.createElement("span");
      label.textContent = item.label;
      const track = document.createElement("span");
      track.className = "ranked-track";
      const bar = document.createElement("span");
      bar.style.width = `${item.value ? Math.max(2, (item.value / maximum) * 100) : 0}%`;
      track.append(bar);
      const value = document.createElement("strong");
      value.textContent = formatExposure(item.value);
      row.append(label, track, value);
      fragment.append(row);
    }
    container.replaceChildren(fragment);
  }

  function renderTrendChart(values, range) {
    if (!muscleTrendChart) return;
    if (!values.length) {
      muscleTrendChart.replaceChildren(createEmptyMessage("No exposure trend is available."));
      return;
    }
    const maximum = Math.max(...values.map((item) => item.value), 1);
    const fragment = document.createDocumentFragment();
    for (const [index, item] of values.entries()) {
      const column = document.createElement("div");
      column.className = "trend-column";
      const currentBucket = index === values.length - 1;
      column.setAttribute("aria-label", `${formatBucketLabel(item.key, range.bucket)}: ${formatExposure(item.value)} weighted sets${currentBucket ? ", partial period" : ""}`);
      const value = document.createElement("span");
      value.className = "trend-value";
      value.textContent = formatExposure(item.value);
      const track = document.createElement("span");
      track.className = "trend-track";
      const bar = document.createElement("span");
      bar.className = "trend-bar";
      bar.style.height = `${item.value ? Math.max(3, (item.value / maximum) * 100) : 0}%`;
      track.append(bar);
      const label = document.createElement("span");
      label.className = "trend-label";
      label.textContent = `${formatBucketLabel(item.key, range.bucket)}${currentBucket ? "*" : ""}`;
      column.append(value, track, label);
      fragment.append(column);
    }
    muscleTrendChart.replaceChildren(fragment);
    muscleTrendChart.setAttribute("aria-label", `Modelled weighted-set exposure over time. The latest ${range.bucket} is partial.`);
  }

  function renderProgressionOptions(exercises) {
    if (!progressionSelect) return;
    const fragment = document.createDocumentFragment();
    for (const exercise of exercises) {
      const option = document.createElement("option");
      option.value = exercise.exercise_id;
      option.textContent = exercise.exercise_name;
      option.selected = String(exercise.exercise_id) === String(selectedProgressionExercise);
      fragment.append(option);
    }
    progressionSelect.replaceChildren(fragment);
    progressionSelect.disabled = exercises.length === 0;
  }

  function renderExerciseProgression() {
    if (!progressionStatus || !progressionChart || !progressionHistory) return;
    if (!dashboardData || !selectedProgressionExercise) {
      progressionStatus.textContent = "Exercise progression appears after an exercise has working sets in at least two sessions in this period.";
      progressionChart.replaceChildren();
      progressionHistory.replaceChildren();
      return;
    }
    const range = getDateRange(dashboardRange, new Date(), dashboardData.sessions);
    const representatives = selectRepresentativeSetsBySeries(filterByRange(dashboardData.records, range), selectedProgressionExercise);
    const selectedExerciseName = representatives[0]?.exercise_name ?? "Exercise";
    const estimates = representatives.flatMap((record) => {
      const display = resolveProgressionOneRepMax(record);
      if (!display?.available) return [];
      return E1RM_MODELS.map((model) => ({ record, display, model, value: display.values[model.key] }));
    });
    const bodyWeightState = getBodyWeightState();
    const uncoveredCount = bodyWeightState.effectiveRelativeEnabled
      ? representatives.filter((record) => {
        return calculateRirE1rmEstimates(record) && !resolveProgressionOneRepMax(record)?.available;
      }).length
      : 0;
    const sessionCount = new Set(representatives.map((record) => record.session_id)).size;
    const seriesKeys = [...new Set(representatives.map(getEquipmentSeriesKey))];
    const seriesColors = assignExerciseSeriesColors(selectedExerciseName, seriesKeys);
    progressionStatus.textContent = [
      `${sessionCount} sessions · one representative working set per machine in each session`,
      uncoveredCount ? `${uncoveredCount} ${uncoveredCount === 1 ? "record has" : "records have"} no body weight for its workout date and ${uncoveredCount === 1 ? "is" : "are"} not plotted` : null,
    ].filter(Boolean).join(" · ");
    renderProgressionTrend(estimates, sessionCount, seriesColors);
    const fragment = document.createDocumentFragment();
    for (const record of [...representatives].reverse()) {
      const row = document.createElement("div");
      row.className = "performance-row";
      row.style.setProperty("--series-color", seriesColors.get(getEquipmentSeriesKey(record)));
      const date = document.createElement("time");
      date.dateTime = record.performed_on;
      date.textContent = formatShortDate(record.performed_on);
      const series = document.createElement("span");
      series.className = "performance-series";
      const swatch = document.createElement("i");
      swatch.setAttribute("aria-hidden", "true");
      const seriesLabel = document.createElement("span");
      seriesLabel.textContent = formatEquipmentLabel(record.equipment_id);
      series.append(swatch, seriesLabel);
      const performance = document.createElement("strong");
      const load = record.weight === null ? "Load not recorded" : `${formatDecimal(Number(record.weight))} ${formatWeightUnit(record.exercise_name)}`;
      const reps = record.reps === null ? "reps not recorded" : `${record.reps} ${record.reps === 1 ? "rep" : "reps"}`;
      performance.textContent = `${load} × ${reps}`;
      const context = document.createElement("span");
      const display = resolveProgressionOneRepMax(record);
      const estimateLabel = !display ? null : display.available
        ? E1RM_MODELS.map((model) => `${model.label}: ${formatOneRepMaxValue(display.values[model.key], display.relative)} ${display.unit}`).join(" · ")
        : display.reason;
      context.textContent = [`Reported RIR ${record.reported_rir_bucket}`, estimateLabel].filter(Boolean).join(" · ");
      row.append(date, series, performance, context);
      fragment.append(row);
    }
    progressionHistory.replaceChildren(fragment);
  }

  function renderProgressionTrend(estimates, sessionCount, seriesColors) {
    if (!progressionChart) return;
    if (sessionCount < 2 || estimates.length < 2) {
      progressionChart.replaceChildren();
      progressionChart.removeAttribute("aria-label");
      return;
    }
    const scale = createLinearScale(estimates.map((item) => item.value));
    const bodyWeightState = getBodyWeightState();
    const unit = bodyWeightState.effectiveRelativeEnabled
      ? (/\(Dumbbell\)/i.test(estimates[0]?.record.exercise_name ?? "") ? "× BW per dumbbell" : "× BW")
      : formatWeightUnit(estimates[0]?.record.exercise_name ?? "");
    const plottedSeries = [...new Set(estimates.map((item) => getEquipmentSeriesKey(item.record)))].sort();
    const legend = document.createElement("div");
    legend.className = "progression-legend";
    legend.setAttribute("aria-label", "Machine series key");
    for (const seriesKey of plottedSeries) {
      const sample = estimates.find((item) => getEquipmentSeriesKey(item.record) === seriesKey)?.record;
      const item = document.createElement("span");
      item.style.setProperty("--series-color", seriesColors.get(seriesKey));
      const swatch = document.createElement("i");
      swatch.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = formatEquipmentLabel(sample?.equipment_id);
      item.append(swatch, label);
      legend.append(item);
    }
    for (const model of E1RM_MODELS) {
      const item = document.createElement("span");
      item.textContent = model.label;
      legend.append(item);
    }
    const yAxis = document.createElement("div");
    yAxis.className = "progression-y-axis";
    const axisTitle = document.createElement("span");
    axisTitle.className = "progression-axis-title";
    axisTitle.textContent = `Estimated 1RM (${unit})`;
    const tickLayer = document.createElement("div");
    tickLayer.className = "progression-y-ticks";
    for (const tick of scale.ticks) {
      const label = document.createElement("span");
      label.style.bottom = `${scale.position(tick)}%`;
      label.textContent = formatOneRepMaxValue(tick, bodyWeightState.effectiveRelativeEnabled);
      tickLayer.append(label);
    }
    yAxis.append(axisTitle, tickLayer);

    const chartBody = document.createElement("div");
    chartBody.className = "progression-chart-body";
    const plot = document.createElement("div");
    plot.className = "progression-plot";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
    grid.setAttribute("class", "progression-grid-lines");
    for (const tick of scale.ticks) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      const y = 100 - scale.position(tick);
      line.setAttribute("x1", "0");
      line.setAttribute("x2", "100");
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      grid.append(line);
    }
    const dates = [...new Set(estimates.map((item) => item.record.performed_on))].sort();
    const points = estimates.map((item) => ({
      ...item,
      seriesKey: getEquipmentSeriesKey(item.record),
      x: dates.length === 1 ? 50 : 2 + (dates.indexOf(item.record.performed_on) / (dates.length - 1)) * 96,
      y: scale.position(item.value),
    }));
    svg.append(grid);
    for (const seriesKey of plottedSeries) {
      for (const model of E1RM_MODELS) {
        const seriesPoints = points.filter((point) => point.seriesKey === seriesKey && point.model.key === model.key).sort((a, b) => a.record.performed_on.localeCompare(b.record.performed_on));
        const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        line.setAttribute("class", "progression-line");
        line.setAttribute("points", seriesPoints.map((point) => `${point.x},${100 - point.y}`).join(" "));
        if (model.dash) line.setAttribute("stroke-dasharray", model.dash);
        line.style.stroke = seriesColors.get(seriesKey);
        svg.append(line);
      }
    }
    plot.append(svg);
    for (const [index, point] of points.entries()) {
      const marker = document.createElement("span");
      marker.className = "progression-marker";
      marker.classList.add(point.x <= 50 ? "is-start" : "is-end");
      marker.style.left = `${point.x}%`;
      marker.style.bottom = `${point.y}%`;
      marker.style.setProperty("--series-color", seriesColors.get(point.seriesKey));
      marker.tabIndex = 0;
      marker.setAttribute("aria-label", `${formatShortDate(point.record.performed_on)}: ${point.model.label} estimated 1RM ${formatOneRepMaxValue(point.value, point.display.relative)} ${unit}`);
      const value = document.createElement("span");
      value.className = "progression-marker-value";
      value.textContent = formatOneRepMaxValue(point.value, point.display.relative);
      const dot = document.createElement("span");
      dot.className = "progression-marker-dot";
      const tooltip = document.createElement("span");
      tooltip.className = "progression-tooltip";
      tooltip.id = `progression-tooltip-${index}`;
      tooltip.setAttribute("role", "tooltip");
      const tooltipDate = document.createElement("strong");
      tooltipDate.textContent = formatShortDate(point.record.performed_on);
      const tooltipSeries = document.createElement("span");
      tooltipSeries.textContent = formatEquipmentLabel(point.record.equipment_id);
      const tooltipPerformance = document.createElement("span");
      const load = point.record.weight === null ? "Load not recorded" : `${formatDecimal(Number(point.record.weight))} ${formatWeightUnit(point.record.exercise_name)}`;
      const reps = point.record.reps === null ? "reps not recorded" : `${point.record.reps} ${point.record.reps === 1 ? "rep" : "reps"}`;
      tooltipPerformance.textContent = `${load} × ${reps}`;
      const tooltipContext = document.createElement("span");
      tooltipContext.textContent = `Reported RIR ${point.record.reported_rir_bucket} · ${point.model.label}: ${formatOneRepMaxValue(point.value, point.display.relative)} ${unit}`;
      tooltip.append(tooltipDate, tooltipSeries, tooltipPerformance, tooltipContext);
      marker.setAttribute("aria-describedby", tooltip.id);
      marker.append(value, dot, tooltip);
      plot.append(marker);
    }
    const xLabels = document.createElement("div");
    xLabels.className = "progression-x-labels";
    xLabels.style.gridTemplateColumns = `repeat(${dates.length}, minmax(0, 1fr))`;
    for (const dateValue of dates) {
      const date = document.createElement("time");
      date.dateTime = dateValue;
      date.textContent = formatShortDate(dateValue);
      xLabels.append(date);
    }
    chartBody.append(plot, xLabels);
    progressionChart.replaceChildren(legend, yAxis, chartBody);
    progressionChart.setAttribute("aria-label", `Line chart of four estimated one-rep-max model values for ${estimates[0]?.record.exercise_name ?? "exercise"}, in ${unit}. This is a formula spread, not a confidence interval.`);
  }

  function resolveProgressionOneRepMax(record) {
    const state = getBodyWeightState();
    return resolveOneRepMaxEstimates(calculateRirE1rmEstimates(record), state.weightByDate.get(record.performed_on), {
      exerciseName: record.exercise_name,
      relativeEnabled: state.effectiveRelativeEnabled,
    });
  }

  function formatOneRepMaxValue(value, relative) {
    return Number(value).toLocaleString(undefined, relative
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 0 });
  }

  function renderRecentChange(groups, exerciseMuscleLookup) {
    if (!recentOverview || !recentGroups) return;
    const comparison = compareRecentPeriods(dashboardData.sessions, dashboardData.records, exerciseMuscleLookup, new Date(), groups);
    if (!comparison.available) {
      recentOverview.replaceChildren(createEmptyMessage("Eight weeks of history are needed for this comparison."));
      recentGroups.replaceChildren();
      return;
    }
    const overview = [
      { label: "Sessions", ...comparison.sessions },
      { label: "Working sets", ...comparison.workingSets },
    ];
    const overviewFragment = document.createDocumentFragment();
    for (const item of overview) {
      const card = document.createElement("div");
      card.className = `recent-metric ${getChangeDirectionClass(item.current, item.previous)}`;
      card.innerHTML = `<span>${item.label}</span><strong>${formatPercentageChange(item.current, item.previous)}</strong><small>${item.current} now · ${item.previous} before</small>`;
      overviewFragment.append(card);
    }
    recentOverview.replaceChildren(overviewFragment);
    const changed = comparison.groups.filter((group) => group.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const fragment = document.createDocumentFragment();
    for (const group of changed) {
      const row = document.createElement("div");
      row.className = `recent-group-row ${getChangeDirectionClass(group.current, group.previous)}`;
      const label = document.createElement("span");
      label.textContent = group.name;
      const delta = document.createElement("strong");
      delta.textContent = formatPercentageChange(group.current, group.previous);
      const context = document.createElement("small");
      context.textContent = `${formatExposure(group.current)} vs ${formatExposure(group.previous)}`;
      row.append(label, delta, context);
      fragment.append(row);
    }
    recentGroups.replaceChildren(fragment.childNodes.length ? fragment : createEmptyMessage("Muscle-group exposure was unchanged between the two periods."));
  }

  function resetDashboardState() {
    dashboardLoadedForUser = null;
    dashboardLoadingForUser = null;
    dashboardData = null;
    selectedDashboardGroup = null;
    selectedProgressionExercise = null;
    if (dashboardStatus) dashboardStatus.textContent = "Loading your dashboard…";
    if (metricGrid) metricGrid.replaceChildren();
    if (dashboardContent) dashboardContent.hidden = true;
    if (dashboardEmpty) dashboardEmpty.hidden = true;
    clearBodyWeightChart();
  }

  function invalidateDashboardState() {
    resetDashboardState();
    if (getActivePageName?.() === "my-data") {
      void loadDashboard();
    }
  }

  return {
    load() {
      return loadDashboard();
    },
    invalidate() {
      invalidateDashboardState();
    },
    reset() {
      resetDashboardState();
    },
  };
}

function stableStringHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function assignExerciseSeriesColors(exerciseName, seriesKeys) {
  const colors = new Map();
  const usedIndexes = new Set();

  [...seriesKeys].sort().forEach((seriesKey) => {
    let colorIndex = stableStringHash(`${exerciseName}:${seriesKey}`) % EXERCISE_SERIES_COLORS.length;
    while (usedIndexes.has(colorIndex) && usedIndexes.size < EXERCISE_SERIES_COLORS.length) {
      colorIndex = (colorIndex + 1) % EXERCISE_SERIES_COLORS.length;
    }
    usedIndexes.add(colorIndex);
    colors.set(seriesKey, EXERCISE_SERIES_COLORS[colorIndex]);
  });

  return colors;
}

function formatEquipmentLabel(equipmentId) {
  return equipmentId === null || equipmentId === undefined || equipmentId === ""
    ? "Equipment not recorded"
    : `Equipment ${equipmentId}`;
}

function getChangeDirectionClass(current, previous) {
  const difference = Number(current) - Number(previous);
  if (difference > 0) return "change-positive";
  if (difference < 0) return "change-negative";
  return "change-neutral";
}

function createEmptyMessage(message) {
  const empty = document.createElement("p");
  empty.className = "empty-chart";
  empty.textContent = message;
  return empty;
}

function formatExposure(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDecimal(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatPercentageChange(current, previous) {
  const percentage = calculatePercentageChange(current, previous);
  if (percentage === null) return Number(current) === 0 ? "No change" : "New this period";
  const rounded = Math.abs(percentage).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return percentage > 0 ? `+${rounded}%` : percentage < 0 ? `−${rounded}%` : "0%";
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatBucketLabel(value, bucket) {
  const date = new Date(`${value}T00:00:00Z`);
  if (bucket === "month") return new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" }).format(date);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function formatWeightUnit(exerciseName) {
  return /\(Dumbbell\)/i.test(exerciseName ?? "") ? "kg per dumbbell" : "kg";
}
