export const BODY_CIRCUMFERENCE_PROTOCOL = "Measure in the morning while fasted and after urinating, before training. Use the same tape and posture when practical. Keep the tape level and snug against the body without compressing the skin.";

export const BODY_CIRCUMFERENCE_SITES = Object.freeze([
  { id: "neck", label: "Neck", instruction: "Wrap the tape around mid-neck, just below the laryngeal prominence, keeping it level." },
  { id: "shoulders", label: "Shoulders", instruction: "Measure around the widest points of both shoulders and deltoids with the arms relaxed." },
  { id: "chest", label: "Chest", instruction: "Measure horizontally around the chest at mid-sternum level after a normal relaxed exhale." },
  { id: "waist", label: "Waist", instruction: "Measure midway between the lowest rib and the top of the hip bone after a normal relaxed exhale." },
  { id: "hips", label: "Hips", instruction: "Measure around the widest circumference of the hips and glutes with the feet together." },
  {
    id: "upper_arm_left",
    label: "Upper arm — left",
    instruction: "With the arm relaxed, measure halfway between the shoulder tip and elbow tip.",
    flexedInstruction: "Bend the elbow to about 90°, hold the upper arm roughly horizontal, maximally flex the upper arm, and measure around its largest circumference.",
  },
  {
    id: "upper_arm_right",
    label: "Upper arm — right",
    instruction: "With the arm relaxed, measure halfway between the shoulder tip and elbow tip.",
    flexedInstruction: "Bend the elbow to about 90°, hold the upper arm roughly horizontal, maximally flex the upper arm, and measure around its largest circumference.",
  },
  { id: "forearm_left", label: "Forearm — left", instruction: "With the arm relaxed, measure around the widest part of the forearm." },
  { id: "forearm_right", label: "Forearm — right", instruction: "With the arm relaxed, measure around the widest part of the forearm." },
  { id: "thigh_left", label: "Thigh — left", instruction: "With the leg relaxed, measure halfway between the groin crease and the top of the kneecap." },
  { id: "thigh_right", label: "Thigh — right", instruction: "With the leg relaxed, measure halfway between the groin crease and the top of the kneecap." },
  { id: "calf_left", label: "Calf — left", instruction: "Standing with weight evenly distributed, measure around the widest part of the calf." },
  { id: "calf_right", label: "Calf — right", instruction: "Standing with weight evenly distributed, measure around the widest part of the calf." },
]);

export const BODY_CIRCUMFERENCE_MEASUREMENT_STATES = Object.freeze(["relaxed", "flexed"]);

const BODY_CIRCUMFERENCE_SITE_MAP = new Map(BODY_CIRCUMFERENCE_SITES.map((site) => [site.id, site]));
const FLEXED_BODY_CIRCUMFERENCE_SITES = new Set(["upper_arm_left", "upper_arm_right"]);

export function bodyCircumferenceMeasurementStatesForSite(site) {
  if (!BODY_CIRCUMFERENCE_SITE_MAP.has(site)) return [];
  return FLEXED_BODY_CIRCUMFERENCE_SITES.has(site) ? ["relaxed", "flexed"] : ["relaxed"];
}

export function getBodyCircumferenceInstruction(site, measurementState = "relaxed") {
  const siteDefinition = BODY_CIRCUMFERENCE_SITE_MAP.get(String(site ?? ""));
  if (!siteDefinition) return BODY_CIRCUMFERENCE_PROTOCOL;
  const allowedStates = bodyCircumferenceMeasurementStatesForSite(siteDefinition.id);
  const normalizedState = String(measurementState ?? "relaxed").toLowerCase();
  const state = allowedStates.includes(normalizedState) ? normalizedState : "relaxed";
  const siteInstruction = state === "flexed" ? siteDefinition.flexedInstruction : siteDefinition.instruction;
  return `${siteInstruction} ${BODY_CIRCUMFERENCE_PROTOCOL}`;
}

export function normalizeBodyCircumferenceDraft({ site, measurementState = "relaxed", measuredAt, circumferenceCm }) {
  const siteDefinition = BODY_CIRCUMFERENCE_SITE_MAP.get(String(site ?? ""));
  if (!siteDefinition) throw new Error("Choose a supported body site.");

  const normalizedState = String(measurementState ?? "relaxed").trim().toLowerCase();
  if (!bodyCircumferenceMeasurementStatesForSite(siteDefinition.id).includes(normalizedState)) {
    throw new Error("Choose a supported measurement state for this body site.");
  }

  const measuredDate = new Date(measuredAt);
  if (!measuredAt || Number.isNaN(measuredDate.getTime())) throw new Error("Choose a valid measurement date and time.");

  const normalizedText = String(circumferenceCm ?? "").trim().replace(",", ".");
  const value = Number(normalizedText);
  if (normalizedText === "" || !Number.isFinite(value) || value <= 0) {
    throw new Error("Circumference must be a finite number greater than zero centimetres.");
  }

  return {
    site: siteDefinition.id,
    measurementState: normalizedState,
    measuredAt: measuredDate.toISOString(),
    circumferenceCm: value,
  };
}

export function selectBodyCircumferenceSeries(measurements, site, measurementState = "relaxed") {
  if (!BODY_CIRCUMFERENCE_SITE_MAP.has(site)) return [];
  const normalizedState = String(measurementState ?? "relaxed").toLowerCase();
  if (!bodyCircumferenceMeasurementStatesForSite(site).includes(normalizedState)) return [];
  return measurements
    .filter((measurement) => measurement.site === site && (measurement.measurement_state ?? "relaxed") === normalizedState)
    .map((measurement) => ({
      ...measurement,
      measurement_state: measurement.measurement_state ?? "relaxed",
      circumference_cm: Number(measurement.circumference_cm),
    }))
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at) || Number(a.id) - Number(b.id));
}

function stateLabel(measurementState) {
  return measurementState === "flexed" ? "Flexed" : "Relaxed";
}

function siteSeriesLabel(site, measurementState) {
  const siteDefinition = BODY_CIRCUMFERENCE_SITE_MAP.get(site);
  const siteLabel = siteDefinition?.label ?? site;
  return FLEXED_BODY_CIRCUMFERENCE_SITES.has(site)
    ? `${stateLabel(measurementState)} ${siteLabel}`
    : siteLabel;
}

function ensureMarkup() {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return;

  const settingsPage = document.querySelector("#settings-page");
  if (settingsPage && !document.querySelector("#body-circumference-settings")) {
    const section = document.createElement("section");
    section.id = "body-circumference-settings";
    section.className = "dashboard-section settings-section";
    section.setAttribute("aria-labelledby", "body-circumference-settings-title");
    section.innerHTML = `
      <div class="section-heading">
        <div><h2 id="body-circumference-settings-title">Body measurements</h2><p>Record standardized circumference observations in centimetres.</p></div>
      </div>
      <p class="model-explanation"><strong>Collection protocol:</strong> ${BODY_CIRCUMFERENCE_PROTOCOL} These are raw tape measurements, not body-fat or body-composition estimates.</p>
      <form id="body-circumference-form" class="body-weight-import-form">
        <label for="body-circumference-site">Body site<select id="body-circumference-site" required></select></label>
        <label id="body-circumference-state-field" for="body-circumference-state" hidden>Measurement state<select id="body-circumference-state"></select></label>
        <p id="body-circumference-instruction" class="section-note"></p>
        <label for="body-circumference-measured-at">Measured at<input id="body-circumference-measured-at" type="datetime-local" required /></label>
        <label for="body-circumference-value">Circumference (cm)<input id="body-circumference-value" type="number" min="0.1" step="0.1" inputmode="decimal" required /></label>
        <div>
          <button id="body-circumference-save" class="primary-button" type="submit">Save measurement</button>
          <button id="body-circumference-cancel-edit" class="text-button" type="button" hidden>Cancel edit</button>
        </div>
        <p id="body-circumference-status" class="dashboard-status" role="status" aria-live="polite"></p>
      </form>
      <div><h3>Measurement history</h3><div id="body-circumference-history" class="performance-history"></div></div>
    `;
    settingsPage.append(section);
  }

  const myDataPage = document.querySelector("#my-data-page");
  if (myDataPage && !document.querySelector("#body-circumference-trends")) {
    const section = document.createElement("section");
    section.id = "body-circumference-trends";
    section.className = "dashboard-section";
    section.setAttribute("aria-labelledby", "body-circumference-trends-title");
    section.innerHTML = `
      <div class="section-heading progression-heading">
        <div><p class="section-kicker">Recorded observations</p><h2 id="body-circumference-trends-title">Body measurement trend</h2><p>Compare circumference observations from the same standardized body site and measurement state over time.</p></div>
        <label class="exercise-select-label" for="body-circumference-trend-site">Body site<select id="body-circumference-trend-site"></select></label>
        <label id="body-circumference-trend-state-field" class="exercise-select-label" for="body-circumference-trend-state" hidden>Measurement state<select id="body-circumference-trend-state"></select></label>
      </div>
      <p class="model-explanation">Only recorded tape measurements from the selected site and state are shown. Relaxed and flexed upper-arm series remain separate. Missing dates remain missing, with no interpolation or extrapolation.</p>
      <p id="body-circumference-trend-status" class="section-note"></p>
      <div id="body-circumference-trend-summary" class="recent-overview"></div>
      <div id="body-circumference-trend-history" class="performance-history"></div>
    `;
    myDataPage.append(section);
  }

  for (const select of [document.querySelector("#body-circumference-site"), document.querySelector("#body-circumference-trend-site")]) {
    if (!select || select.options?.length) continue;
    for (const site of BODY_CIRCUMFERENCE_SITES) {
      const option = document.createElement("option");
      option.value = site.id;
      option.textContent = site.label;
      select.append(option);
    }
    select.value = "waist";
  }
}

function formatValue(value) {
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} cm`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function datetimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function replaceStateOptions(select, site, preferredState = "relaxed") {
  const allowedStates = bodyCircumferenceMeasurementStatesForSite(site);
  if (!select || !allowedStates.length) return "relaxed";
  const nextState = allowedStates.includes(preferredState) ? preferredState : "relaxed";
  select.replaceChildren();
  for (const state of allowedStates) {
    const option = document.createElement("option");
    option.value = state;
    option.textContent = stateLabel(state);
    select.append(option);
  }
  select.value = nextState;
  return nextState;
}

export function createBodyCircumferenceFeature({ getClient, getUserId }) {
  ensureMarkup();

  const form = document.querySelector("#body-circumference-form");
  const siteInput = document.querySelector("#body-circumference-site");
  const stateField = document.querySelector("#body-circumference-state-field");
  const stateInput = document.querySelector("#body-circumference-state");
  const instruction = document.querySelector("#body-circumference-instruction");
  const measuredAtInput = document.querySelector("#body-circumference-measured-at");
  const valueInput = document.querySelector("#body-circumference-value");
  const saveButton = document.querySelector("#body-circumference-save");
  const cancelEditButton = document.querySelector("#body-circumference-cancel-edit");
  const status = document.querySelector("#body-circumference-status");
  const history = document.querySelector("#body-circumference-history");
  const trendSite = document.querySelector("#body-circumference-trend-site");
  const trendStateField = document.querySelector("#body-circumference-trend-state-field");
  const trendState = document.querySelector("#body-circumference-trend-state");
  const trendStatus = document.querySelector("#body-circumference-trend-status");
  const trendSummary = document.querySelector("#body-circumference-trend-summary");
  const trendHistory = document.querySelector("#body-circumference-trend-history");

  let state = emptyState();
  let editingId = null;

  form?.addEventListener?.("submit", saveFromForm);
  siteInput?.addEventListener?.("change", handleSiteChange);
  stateInput?.addEventListener?.("change", renderInstruction);
  cancelEditButton?.addEventListener?.("click", resetForm);
  history?.addEventListener?.("click", handleHistoryAction);
  trendSite?.addEventListener?.("change", handleTrendSiteChange);
  trendState?.addEventListener?.("change", renderTrend);
  initializeForm();

  function emptyState() {
    return { userId: null, loaded: false, loading: null, measurements: [] };
  }

  function syncStateControl(preferredState = stateInput?.value ?? "relaxed") {
    if (!siteInput) return "relaxed";
    const allowedStates = bodyCircumferenceMeasurementStatesForSite(siteInput.value);
    const nextState = replaceStateOptions(stateInput, siteInput.value, preferredState);
    if (stateField) stateField.hidden = allowedStates.length <= 1;
    return nextState;
  }

  function syncTrendStateControl(preferredState = trendState?.value ?? "relaxed") {
    if (!trendSite) return "relaxed";
    const allowedStates = bodyCircumferenceMeasurementStatesForSite(trendSite.value);
    const nextState = replaceStateOptions(trendState, trendSite.value, preferredState);
    if (trendStateField) trendStateField.hidden = allowedStates.length <= 1;
    return nextState;
  }

  function initializeForm() {
    syncStateControl();
    syncTrendStateControl();
    if (siteInput && BODY_CIRCUMFERENCE_SITE_MAP.has(siteInput.value)) renderInstruction();
    if (measuredAtInput && !measuredAtInput.value) measuredAtInput.value = datetimeLocalValue();
  }

  function handleSiteChange() {
    syncStateControl("relaxed");
    renderInstruction();
  }

  function handleTrendSiteChange() {
    syncTrendStateControl("relaxed");
    renderTrend();
  }

  function renderInstruction() {
    if (!instruction || !siteInput) return;
    instruction.textContent = getBodyCircumferenceInstruction(siteInput.value, stateInput?.value ?? "relaxed");
  }

  function resetForm() {
    editingId = null;
    form?.reset?.();
    if (siteInput) siteInput.value = "waist";
    syncStateControl("relaxed");
    if (measuredAtInput) measuredAtInput.value = datetimeLocalValue();
    if (valueInput) valueInput.value = "";
    if (saveButton) saveButton.textContent = "Save measurement";
    if (cancelEditButton) cancelEditButton.hidden = true;
    renderInstruction();
  }

  async function ensureState(force = false) {
    const supabase = getClient();
    const requestedUserId = getUserId();
    if (!requestedUserId || !supabase) return emptyState();
    if (!force && state.loaded && state.userId === requestedUserId) return state;
    if (!force && state.loading && state.userId === requestedUserId) return state.loading;

    const loading = (async () => {
      const { data, error } = await supabase
        .from("body_circumference_measurements")
        .select("id, owner_id, site, measurement_state, measured_at, circumference_cm, created_at, updated_at")
        .eq("owner_id", requestedUserId)
        .order("measured_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      if (requestedUserId !== getUserId()) return emptyState();
      state = {
        userId: requestedUserId,
        loaded: true,
        loading: null,
        measurements: (data ?? []).map((measurement) => ({
          ...measurement,
          measurement_state: measurement.measurement_state ?? "relaxed",
          circumference_cm: Number(measurement.circumference_cm),
        })),
      };
      renderManager();
      renderTrend();
      return state;
    })();
    state = { ...emptyState(), userId: requestedUserId, loading };
    try {
      return await loading;
    } catch (error) {
      state = { ...emptyState(), userId: requestedUserId };
      if (status) status.textContent = `Could not load body measurements: ${error.message}`;
      if (trendStatus) trendStatus.textContent = `Could not load body measurements: ${error.message}`;
      throw error;
    }
  }

  async function save(draft, measurementId = null) {
    const supabase = getClient();
    const requestedUserId = getUserId();
    if (!requestedUserId || !supabase) throw new Error("Sign in before saving a body measurement.");
    const normalized = normalizeBodyCircumferenceDraft(draft);
    const payload = {
      owner_id: requestedUserId,
      site: normalized.site,
      measurement_state: normalized.measurementState,
      measured_at: normalized.measuredAt,
      circumference_cm: normalized.circumferenceCm,
      updated_at: new Date().toISOString(),
    };
    let query;
    if (measurementId === null || measurementId === undefined) {
      query = supabase.from("body_circumference_measurements").insert(payload);
    } else {
      query = supabase.from("body_circumference_measurements").update(payload).eq("id", measurementId).eq("owner_id", requestedUserId);
    }
    const { error } = await query;
    if (error) throw error;
    await ensureState(true);
    return normalized;
  }

  async function remove(measurementId) {
    const supabase = getClient();
    const requestedUserId = getUserId();
    if (!requestedUserId || !supabase) throw new Error("Sign in before deleting a body measurement.");
    const { error } = await supabase.from("body_circumference_measurements").delete().eq("id", measurementId).eq("owner_id", requestedUserId);
    if (error) throw error;
    await ensureState(true);
  }

  async function saveFromForm(event) {
    event.preventDefault();
    if (!siteInput || !measuredAtInput || !valueInput) return;
    if (saveButton) saveButton.disabled = true;
    if (status) status.textContent = editingId ? "Updating measurement…" : "Saving measurement…";
    try {
      await save({
        site: siteInput.value,
        measurementState: stateInput?.value ?? "relaxed",
        measuredAt: measuredAtInput.value,
        circumferenceCm: valueInput.value,
      }, editingId);
      if (status) status.textContent = editingId ? "Measurement updated." : "Measurement saved.";
      resetForm();
    } catch (error) {
      if (status) status.textContent = `Could not save measurement: ${error.message}`;
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  }

  async function handleHistoryAction(event) {
    const editButton = event.target.closest?.("[data-circumference-edit]");
    if (editButton) {
      const measurement = state.measurements.find((item) => String(item.id) === editButton.dataset.circumferenceEdit);
      if (!measurement) return;
      editingId = measurement.id;
      if (siteInput) siteInput.value = measurement.site;
      syncStateControl(measurement.measurement_state ?? "relaxed");
      if (measuredAtInput) measuredAtInput.value = datetimeLocalValue(measurement.measured_at);
      if (valueInput) valueInput.value = String(measurement.circumference_cm);
      if (saveButton) saveButton.textContent = "Update measurement";
      if (cancelEditButton) cancelEditButton.hidden = false;
      renderInstruction();
      valueInput?.focus?.();
      return;
    }

    const deleteButton = event.target.closest?.("[data-circumference-delete]");
    if (!deleteButton) return;
    const measurement = state.measurements.find((item) => String(item.id) === deleteButton.dataset.circumferenceDelete);
    if (!measurement) return;
    const seriesName = siteSeriesLabel(measurement.site, measurement.measurement_state ?? "relaxed");
    const confirmed = typeof window === "undefined" || typeof window.confirm !== "function"
      ? true
      : window.confirm(`Delete the ${seriesName.toLowerCase()} measurement from ${formatDateTime(measurement.measured_at)}?`);
    if (!confirmed) return;
    if (status) status.textContent = "Deleting measurement…";
    try {
      await remove(measurement.id);
      if (status) status.textContent = "Measurement deleted.";
      if (editingId === measurement.id) resetForm();
    } catch (error) {
      if (status) status.textContent = `Could not delete measurement: ${error.message}`;
    }
  }

  function renderManager() {
    if (!history || typeof document?.createElement !== "function" || typeof history.replaceChildren !== "function") return;
    const measurements = [...state.measurements].sort((a, b) => b.measured_at.localeCompare(a.measured_at) || Number(b.id) - Number(a.id));
    if (!measurements.length) {
      const empty = document.createElement("p");
      empty.className = "section-note";
      empty.textContent = "No body measurements recorded yet.";
      history.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const measurement of measurements) {
      const row = document.createElement("article");
      row.className = "performance-row";
      const description = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = siteSeriesLabel(measurement.site, measurement.measurement_state ?? "relaxed");
      const detail = document.createElement("p");
      detail.textContent = `${formatValue(measurement.circumference_cm)} · ${formatDateTime(measurement.measured_at)}`;
      description.append(title, detail);
      const actions = document.createElement("div");
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "text-button";
      edit.dataset.circumferenceEdit = measurement.id;
      edit.textContent = "Edit";
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "text-button";
      removeButton.dataset.circumferenceDelete = measurement.id;
      removeButton.textContent = "Delete";
      actions.append(edit, removeButton);
      row.append(description, actions);
      fragment.append(row);
    }
    history.replaceChildren(fragment);
  }

  function renderTrend() {
    if (!trendSite || !trendStatus) return;
    let selectedSite = trendSite.value;
    let selectedState = trendState?.value ?? "relaxed";
    let series = selectBodyCircumferenceSeries(state.measurements, selectedSite, selectedState);
    const selectedSiteHasMeasurements = state.measurements.some((measurement) => measurement.site === selectedSite);

    if (!selectedSiteHasMeasurements && state.measurements.length) {
      const firstMeasurement = state.measurements[0];
      selectedSite = firstMeasurement.site;
      trendSite.value = selectedSite;
      selectedState = syncTrendStateControl(firstMeasurement.measurement_state ?? "relaxed");
      series = selectBodyCircumferenceSeries(state.measurements, selectedSite, selectedState);
    }

    const seriesName = siteSeriesLabel(selectedSite, selectedState);
    if (!series.length) {
      trendStatus.textContent = `No ${seriesName.toLowerCase()} measurements yet.`;
      trendSummary?.replaceChildren?.();
      trendHistory?.replaceChildren?.();
      return;
    }

    const first = series[0];
    const latest = series.at(-1);
    const change = Number(latest.circumference_cm) - Number(first.circumference_cm);
    const changeLabel = `${change >= 0 ? "+" : "−"}${Math.abs(change).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} cm`;
    trendStatus.textContent = `${series.length.toLocaleString()} recorded ${seriesName.toLowerCase()} ${series.length === 1 ? "measurement" : "measurements"}. Missing dates are not filled.`;

    if (trendSummary && typeof document?.createElement === "function" && typeof trendSummary.replaceChildren === "function") {
      const summary = document.createElement("p");
      summary.textContent = series.length === 1
        ? `Only observation: ${formatValue(first.circumference_cm)} on ${formatDateTime(first.measured_at)}.`
        : `First ${formatValue(first.circumference_cm)} → latest ${formatValue(latest.circumference_cm)} · net change ${changeLabel}.`;
      trendSummary.replaceChildren(summary);
    }

    if (trendHistory && typeof document?.createElement === "function" && typeof trendHistory.replaceChildren === "function") {
      const list = document.createElement("ol");
      list.className = "ranked-list";
      for (const measurement of series) {
        const item = document.createElement("li");
        item.textContent = `${formatDateTime(measurement.measured_at)} — ${formatValue(measurement.circumference_cm)}`;
        list.append(item);
      }
      trendHistory.replaceChildren(list);
    }
  }

  function reset() {
    state = emptyState();
    editingId = null;
    history?.replaceChildren?.();
    trendSummary?.replaceChildren?.();
    trendHistory?.replaceChildren?.();
    if (status) status.textContent = "";
    if (trendStatus) trendStatus.textContent = "";
    resetForm();
  }

  return {
    ensureState,
    getState() {
      return { loaded: state.loaded, measurements: state.measurements.map((measurement) => ({ ...measurement })) };
    },
    save,
    remove,
    reset,
  };
}
