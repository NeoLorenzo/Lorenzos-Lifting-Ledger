import { normalizePresetName, uniqueSessionExercises, validatePresetDraft } from "../presets.js";

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(year, month - 1, day));
}

export function createPresetFeature(options) {
  const { getClient, getUserId, ensureExerciseCatalogue, onStartPreset } = options;

  // DOM elements lookup
  const createPresetButton = document.querySelector("#create-preset");
  const presetStatus = document.querySelector("#preset-status");
  const presetEmpty = document.querySelector("#preset-empty");
  const presetList = document.querySelector("#preset-list");
  const presetModal = document.querySelector("#preset-modal");
  const presetCreationChoices = document.querySelector("#preset-creation-choices");
  const cancelPresetCreationButton = document.querySelector("#cancel-preset-creation");
  const presetEditor = document.querySelector("#preset-editor");
  const presetEditorKicker = document.querySelector("#preset-editor-kicker");
  const presetEditorTitle = document.querySelector("#preset-editor-title");
  const closePresetEditorButton = document.querySelector("#close-preset-editor");
  const cancelPresetEditorButton = document.querySelector("#cancel-preset-editor");
  const presetNameInput = document.querySelector("#preset-name");
  const presetSessionSource = document.querySelector("#preset-session-source");
  const presetSessionSelect = document.querySelector("#preset-session-select");
  const presetSessionStatus = document.querySelector("#preset-session-status");
  const presetSessionPreview = document.querySelector("#preset-session-preview");
  const presetSelectedList = document.querySelector("#preset-selected-list");
  const presetSelectedCount = document.querySelector("#preset-selected-count");
  const presetSelectedEmpty = document.querySelector("#preset-selected-empty");
  const presetExerciseSearch = document.querySelector("#preset-exercise-search");
  const presetExerciseResults = document.querySelector("#preset-exercise-results");
  const presetExerciseEmpty = document.querySelector("#preset-exercise-empty");
  const presetEditorStatus = document.querySelector("#preset-editor-status");
  const savePresetButton = document.querySelector("#save-preset");

  // Session preset picker elements
  const sessionPresetPicker = document.querySelector("#session-preset-picker");
  const sessionPresetStatus = document.querySelector("#session-preset-status");
  const sessionPresetList = document.querySelector("#session-preset-list");
  const sessionStartChoices = document.querySelector("#session-start-choices");

  // Feature-local state
  let presets = [];
  let presetsLoadedForUser = null;
  let presetsLoadingForUser = null;
  let presetSourceSessions = [];
  let presetSourceSessionsForUser = null;
  let editingPresetId = null;
  let presetEditorSource = null;
  let selectedPresetExerciseIds = new Set();
  let presetSetCounts = new Map();
  let globalExerciseCatalogue = [];

  // Register event listeners
  if (createPresetButton) {
    createPresetButton.addEventListener("click", showPresetCreationChoices);
  }
  if (cancelPresetCreationButton) {
    cancelPresetCreationButton.addEventListener("click", closePresetWorkspace);
  }
  if (closePresetEditorButton) {
    closePresetEditorButton.addEventListener("click", closePresetWorkspace);
  }
  if (cancelPresetEditorButton) {
    cancelPresetEditorButton.addEventListener("click", closePresetWorkspace);
  }
  if (presetModal) {
    presetModal.addEventListener("cancel", (event) => {
      event.preventDefault();
      closePresetWorkspace();
    });
    presetModal.addEventListener("click", (event) => {
      if (event.target === presetModal) closePresetWorkspace();
    });
  }
  if (presetCreationChoices) {
    presetCreationChoices.addEventListener("click", (event) => {
      const button = event.target.closest("[data-preset-source]");
      if (!button) return;
      void openNewPresetEditor(button.dataset.presetSource);
    });
  }
  if (presetList) {
    presetList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-preset-action]");
      if (!button) return;
      const preset = presets.find((item) => String(item.id) === button.dataset.presetId);
      if (!preset) return;
      if (button.dataset.presetAction === "delete") {
        void deletePreset(preset);
        return;
      }
      if (button.dataset.presetAction === "edit") openExistingPresetEditor(preset);
    });
  }
  if (presetExerciseSearch) {
    presetExerciseSearch.addEventListener("input", renderPresetExerciseCatalogue);
  }
  if (presetExerciseResults) {
    presetExerciseResults.addEventListener("click", (event) => {
      const button = event.target.closest("[data-add-exercise]");
      if (!button) return;
      selectedPresetExerciseIds.add(button.dataset.addExercise);
      if (!presetSetCounts.has(button.dataset.addExercise)) presetSetCounts.set(button.dataset.addExercise, 1);
      renderPresetExercisePicker();
    });
  }
  if (presetSelectedList) {
    presetSelectedList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-exercise]");
      if (!button) return;
      selectedPresetExerciseIds.delete(button.dataset.removeExercise);
      presetSetCounts.delete(button.dataset.removeExercise);
      renderPresetExercisePicker();
    });
    presetSelectedList.addEventListener("input", (event) => {
      const input = event.target.closest("[data-preset-set-count]");
      if (!input) return;
      const setCount = Math.min(20, Math.max(1, Number.parseInt(input.value, 10) || 1));
      input.value = String(setCount);
      presetSetCounts.set(input.dataset.presetSetCount, setCount);
    });
  }
  if (presetSessionSelect) {
    presetSessionSelect.addEventListener("change", applySelectedPresetSession);
  }
  if (presetEditor) {
    presetEditor.addEventListener("submit", (event) => {
      event.preventDefault();
      void savePreset();
    });
  }
  if (sessionPresetList) {
    sessionPresetList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-start-preset]");
      if (button) {
        const presetId = button.dataset.startPreset;
        const preset = presets.find((item) => String(item.id) === String(presetId));
        onStartPreset(presetId, preset?.name);
      }
    });
  }

  async function loadPresets(supabase, force = false) {
    const requestedUserId = getUserId();
    if (!requestedUserId) return;
    if (!force && (presetsLoadedForUser === requestedUserId || presetsLoadingForUser === requestedUserId)) return;

    presetsLoadingForUser = requestedUserId;
    if (presetStatus) presetStatus.textContent = "Loading your presets…";
    if (presetEmpty) presetEmpty.hidden = true;

    try {
      const [presetResult, catalogue] = await Promise.all([
        supabase
          .from("workout_presets")
          .select("id, name, created_at, updated_at, workout_preset_exercises(exercise_id, set_count, exercises(id, name))")
          .eq("owner_id", requestedUserId)
          .order("name", { ascending: true })
          .order("id", { ascending: true }),
        ensureExerciseCatalogue(),
      ]);
      if (presetResult.error) throw presetResult.error;
      if (requestedUserId !== getUserId()) return;

      globalExerciseCatalogue = catalogue;
      presets = presetResult.data.map((preset) => ({
        ...preset,
        exercises: (preset.workout_preset_exercises ?? []).map((membership) => ({
          id: membership.exercise_id,
          setCount: membership.set_count ?? 1,
          name: membership.exercises?.name
            ?? globalExerciseCatalogue.find((exercise) => String(exercise.id) === String(membership.exercise_id))?.name
            ?? "Unknown exercise",
        })).sort((a, b) => a.name.localeCompare(b.name)),
      }));
      presetsLoadedForUser = requestedUserId;
      renderPresetList();
    } catch (error) {
      if (requestedUserId !== getUserId()) return;
      presets = [];
      presetsLoadedForUser = null;
      if (presetList) presetList.replaceChildren();
      if (presetEmpty) presetEmpty.hidden = true;
      if (presetStatus) {
        presetStatus.textContent = `Could not load your presets: ${formatPresetError(error)}`;
      }
    } finally {
      if (presetsLoadingForUser === requestedUserId) presetsLoadingForUser = null;
    }
  }

  function renderPresetList() {
    if (!presetList) return;
    const fragment = document.createDocumentFragment();

    for (const preset of presets) {
      const item = document.createElement("li");
      item.className = "preset-card";
      item.tabIndex = 0;
      item.setAttribute("aria-label", `${preset.name} preset`);

      const headingRow = document.createElement("div");
      headingRow.className = "preset-card-heading";
      const heading = document.createElement("h3");
      heading.textContent = preset.name;
      const count = document.createElement("span");
      count.textContent = `${preset.exercises.length} ${preset.exercises.length === 1 ? "exercise" : "exercises"}`;
      headingRow.append(heading, count);

      const exerciseList = document.createElement("ul");
      exerciseList.className = "preset-card-exercises";
      for (const exercise of preset.exercises) {
        const exerciseItem = document.createElement("li");
        exerciseItem.textContent = `${exercise.name} · ${exercise.setCount} ${exercise.setCount === 1 ? "set" : "sets"}`;
        exerciseList.append(exerciseItem);
      }

      const actions = document.createElement("div");
      actions.className = "preset-card-actions";
      for (const [action, label] of [["edit", "Edit"], ["delete", "Delete"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.presetAction = action;
        button.dataset.presetId = preset.id;
        button.textContent = label;
        if (action === "delete") button.className = "danger-button";
        actions.append(button);
      }

      item.append(headingRow, exerciseList, actions);
      fragment.append(item);
    }

    presetList.replaceChildren(fragment);
    if (presetEmpty) presetEmpty.hidden = presets.length !== 0;
    if (presetStatus) {
      presetStatus.textContent = presets.length
        ? `${presets.length.toLocaleString()} ${presets.length === 1 ? "preset" : "presets"}`
        : "";
    }
  }

  function openPresetModal(labelledBy) {
    if (!presetModal) return;
    presetModal.setAttribute("aria-labelledby", labelledBy);
    if (!presetModal.open) presetModal.showModal();
    document.body.classList.add("preset-modal-open");
  }

  function showPresetCreationChoices() {
    if (presetEditor) presetEditor.hidden = true;
    if (presetCreationChoices) presetCreationChoices.hidden = false;
    if (presetEditorStatus) presetEditorStatus.textContent = "";
    openPresetModal("preset-create-title");
    presetCreationChoices?.querySelector("[data-preset-source]")?.focus();
  }

  function closePresetWorkspace() {
    if (presetModal && presetModal.open) presetModal.close();
    document.body.classList.remove("preset-modal-open");
    if (presetCreationChoices) presetCreationChoices.hidden = true;
    if (presetEditor) {
      presetEditor.hidden = true;
      presetEditor.reset();
    }
    if (presetSessionSource) presetSessionSource.hidden = true;
    if (presetSessionPreview) presetSessionPreview.hidden = true;
    if (presetEditorStatus) presetEditorStatus.textContent = "";
    if (presetNameInput) presetNameInput.setCustomValidity("");
    editingPresetId = null;
    presetEditorSource = null;
    selectedPresetExerciseIds = new Set();
    presetSetCounts = new Map();
  }

  async function openNewPresetEditor(source) {
    if (source !== "scratch" && source !== "session") return;
    if (presetCreationChoices) presetCreationChoices.hidden = true;
    if (presetEditor) {
      presetEditor.hidden = false;
      presetEditor.reset();
    }
    openPresetModal("preset-editor-title");
    if (presetEditorKicker) presetEditorKicker.textContent = "New preset";
    if (presetEditorTitle) presetEditorTitle.textContent = source === "session" ? "Create from previous session" : "Create from scratch";
    if (savePresetButton) savePresetButton.textContent = "Create preset";
    editingPresetId = null;
    presetEditorSource = source;
    selectedPresetExerciseIds = new Set();
    presetSetCounts = new Map();
    if (presetEditorStatus) presetEditorStatus.textContent = "";
    if (presetNameInput) presetNameInput.setCustomValidity("");
    if (presetSessionSource) presetSessionSource.hidden = source !== "session";
    if (presetSessionSelect) presetSessionSelect.required = source === "session";
    if (presetSessionPreview) presetSessionPreview.hidden = true;
    if (presetExerciseSearch) presetExerciseSearch.value = "";
    setPresetEditorBusy(true);

    try {
      const catalogue = await ensureExerciseCatalogue();
      globalExerciseCatalogue = catalogue;
      if (source === "session") await loadPresetSourceSessions();
      renderPresetExercisePicker();
    } catch (error) {
      if (presetEditorStatus) {
        presetEditorStatus.textContent = `Could not prepare the preset editor: ${formatPresetError(error)}`;
      }
    } finally {
      setPresetEditorBusy(false);
      presetNameInput?.focus();
    }
  }

  function openExistingPresetEditor(preset) {
    if (presetCreationChoices) presetCreationChoices.hidden = true;
    if (presetEditor) {
      presetEditor.hidden = false;
      presetEditor.reset();
    }
    openPresetModal("preset-editor-title");
    if (presetEditorKicker) presetEditorKicker.textContent = "Existing preset";
    if (presetEditorTitle) presetEditorTitle.textContent = preset.name;
    if (savePresetButton) savePresetButton.textContent = "Save changes";
    editingPresetId = preset.id;
    presetEditorSource = "existing";
    selectedPresetExerciseIds = new Set(preset.exercises.map((exercise) => String(exercise.id)));
    presetSetCounts = new Map(preset.exercises.map((exercise) => [String(exercise.id), exercise.setCount]));
    if (presetNameInput) presetNameInput.value = preset.name;
    if (presetSessionSource) presetSessionSource.hidden = true;
    if (presetSessionSelect) presetSessionSelect.required = false;
    if (presetSessionPreview) presetSessionPreview.hidden = true;
    if (presetExerciseSearch) presetExerciseSearch.value = "";
    if (presetEditorStatus) presetEditorStatus.textContent = "";
    if (presetNameInput) presetNameInput.setCustomValidity("");
    renderPresetExercisePicker();
    if (presetNameInput) {
      presetNameInput.focus();
      presetNameInput.select();
    }
  }

  async function loadPresetSourceSessions() {
    const supabase = getClient();
    const requestedUserId = getUserId();
    if (presetSessionStatus) presetSessionStatus.textContent = "Loading completed sessions…";
    if (presetSessionSelect) {
      presetSessionSelect.replaceChildren();
      presetSessionSelect.disabled = true;
    }

    if (presetSourceSessionsForUser !== requestedUserId) {
      const sessions = [];
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("workout_sessions")
          .select("id, performed_on, gyms(name), session_exercises(exercise_id, exercises(name), exercise_sets(id))")
          .eq("owner_id", requestedUserId)
          .eq("status", "completed")
          .order("performed_on", { ascending: false })
          .order("id", { ascending: false })
          .range(sessions.length, sessions.length + batchSize - 1);
        if (error) throw error;
        if (requestedUserId !== getUserId()) return;
        sessions.push(...data);
        if (data.length < batchSize) break;
      }
      presetSourceSessions = sessions;
      presetSourceSessionsForUser = requestedUserId;
    }

    const options = document.createDocumentFragment();
    for (const session of presetSourceSessions) {
      const exercises = uniqueSessionExercises(session);
      const option = document.createElement("option");
      option.value = session.id;
      const exerciseSummary = exercises.slice(0, 3).map((exercise) => exercise.name).join(", ");
      const remaining = exercises.length > 3 ? ` +${exercises.length - 3} more` : "";
      option.textContent = `${formatDate(session.performed_on)} · ${session.gyms?.name ?? "Gym"} · ${exerciseSummary}${remaining}`;
      options.append(option);
    }
    if (presetSessionSelect) {
      presetSessionSelect.replaceChildren(options);
      presetSessionSelect.disabled = presetSourceSessions.length === 0;
    }
    if (presetSessionStatus) {
      presetSessionStatus.textContent = presetSourceSessions.length
        ? `${presetSourceSessions.length.toLocaleString()} completed ${presetSourceSessions.length === 1 ? "session" : "sessions"}`
        : "No previous sessions are available.";
    }
    if (presetSourceSessions.length) applySelectedPresetSession();
  }

  function applySelectedPresetSession() {
    if (!presetSessionSelect) return;
    const session = presetSourceSessions.find((item) => String(item.id) === presetSessionSelect.value);
    if (!session) {
      if (presetSessionPreview) presetSessionPreview.hidden = true;
      selectedPresetExerciseIds = new Set();
      presetSetCounts = new Map();
      renderPresetExercisePicker();
      return;
    }

    const exercises = uniqueSessionExercises(session);
    selectedPresetExerciseIds = new Set(exercises.map((exercise) => String(exercise.id)));
    presetSetCounts = new Map(exercises.map((exercise) => [String(exercise.id), exercise.setCount]));
    if (presetSessionPreview) {
      const heading = document.createElement("strong");
      heading.textContent = `${formatDate(session.performed_on)} · ${session.gyms?.name ?? "Gym"}`;
      const copy = document.createElement("p");
      copy.textContent = exercises.map((exercise) => exercise.name).join(" · ") || "No exercises recorded";
      presetSessionPreview.replaceChildren(heading, copy);
      presetSessionPreview.hidden = false;
    }
    renderPresetExercisePicker();
  }

  function renderPresetExercisePicker() {
    renderSelectedPresetExercises();
    renderPresetExerciseCatalogue();
  }

  function renderSelectedPresetExercises() {
    if (!presetSelectedList) return;
    const selected = globalExerciseCatalogue
      .filter((exercise) => selectedPresetExerciseIds.has(String(exercise.id)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const fragment = document.createDocumentFragment();

    for (const exercise of selected) {
      const exerciseId = String(exercise.id);
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = exercise.name;

      const controls = document.createElement("div");
      controls.className = "preset-set-controls";
      const setLabel = document.createElement("label");
      setLabel.textContent = "Sets";
      const setInput = document.createElement("input");
      setInput.type = "number";
      setInput.min = "1";
      setInput.max = "20";
      setInput.step = "1";
      setInput.inputMode = "numeric";
      setInput.value = String(presetSetCounts.get(exerciseId) ?? 1);
      setInput.dataset.presetSetCount = exerciseId;
      setInput.setAttribute("aria-label", `Sets for ${exercise.name}`);
      setLabel.append(setInput);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.removeExercise = exercise.id;
      remove.setAttribute("aria-label", `Remove ${exercise.name}`);
      remove.textContent = "Remove";
      controls.append(setLabel, remove);
      item.append(name, controls);
      fragment.append(item);
    }

    presetSelectedList.replaceChildren(fragment);
    if (presetSelectedCount) presetSelectedCount.textContent = `${selected.length} ${selected.length === 1 ? "exercise" : "exercises"}`;
    if (presetSelectedEmpty) presetSelectedEmpty.hidden = selected.length !== 0;
  }

  function renderPresetExerciseCatalogue() {
    if (!presetExerciseResults) return;
    const query = presetExerciseSearch ? presetExerciseSearch.value.trim().toLocaleLowerCase() : "";
    const matches = globalExerciseCatalogue.filter((exercise) => exercise.name.toLocaleLowerCase().includes(query));
    const fragment = document.createDocumentFragment();

    for (const exercise of matches) {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = exercise.name;
      const add = document.createElement("button");
      const selected = selectedPresetExerciseIds.has(String(exercise.id));
      add.type = "button";
      add.dataset.addExercise = exercise.id;
      add.disabled = selected;
      add.textContent = selected ? "Added" : "Add";
      item.append(name, add);
      fragment.append(item);
    }

    presetExerciseResults.replaceChildren(fragment);
    if (presetExerciseEmpty) presetExerciseEmpty.hidden = matches.length !== 0;
  }

  async function savePreset() {
    const supabase = getClient();
    const activeUserId = getUserId();
    if (!supabase || !activeUserId) {
      if (presetEditorStatus) presetEditorStatus.textContent = "You are no longer signed in.";
      return;
    }

    const name = normalizePresetName(presetNameInput ? presetNameInput.value : "");
    const selectedExercises = globalExerciseCatalogue
      .filter((exercise) => selectedPresetExerciseIds.has(String(exercise.id)));
    const exerciseIds = selectedExercises.map((exercise) => exercise.id);
    const setCounts = selectedExercises.map((exercise) => presetSetCounts.get(String(exercise.id)) ?? 1);
    const validationMessage = validatePresetDraft({
      presets,
      presetId: editingPresetId,
      name,
      exerciseIds,
      setCounts,
    });
    if (presetNameInput) {
      presetNameInput.setCustomValidity(validationMessage.includes("name") ? validationMessage : "");
    }
    if (validationMessage) {
      if (presetEditorStatus) presetEditorStatus.textContent = validationMessage;
      if (presetNameInput && !presetNameInput.reportValidity()) presetNameInput.focus();
      return;
    }

    const requestedUserId = activeUserId;
    const wasEditing = editingPresetId !== null;
    setPresetEditorBusy(true);
    if (presetEditorStatus) {
      presetEditorStatus.textContent = wasEditing ? "Saving changes…" : "Creating preset…";
    }

    try {
      const { error } = await supabase.rpc("save_workout_preset", {
        p_preset_id: editingPresetId,
        p_name: name,
        p_exercise_ids: exerciseIds,
        p_set_counts: setCounts,
      });
      if (error) throw error;
      if (requestedUserId !== getUserId()) throw new Error("Your session changed while saving.");

      closePresetWorkspace();
      presetsLoadedForUser = null;
      await loadPresets(supabase, true);
      if (presetStatus) presetStatus.textContent = wasEditing ? "Preset updated." : "Preset created.";
    } catch (error) {
      if (presetEditorStatus) {
        presetEditorStatus.textContent = `Could not save preset: ${formatPresetError(error)}`;
      }
    } finally {
      setPresetEditorBusy(false);
    }
  }

  async function deletePreset(preset) {
    const supabase = getClient();
    const activeUserId = getUserId();
    if (!supabase || !activeUserId) return;
    if (!window.confirm(`Delete “${preset.name}”? This cannot be undone.`)) return;

    const requestedUserId = activeUserId;
    if (presetStatus) presetStatus.textContent = `Deleting ${preset.name}…`;
    try {
      const { error } = await supabase
        .from("workout_presets")
        .delete()
        .eq("id", preset.id)
        .eq("owner_id", requestedUserId);
      if (error) throw error;
      if (requestedUserId !== getUserId()) return;
      presetsLoadedForUser = null;
      await loadPresets(supabase, true);
      if (presetStatus) presetStatus.textContent = "Preset deleted.";
    } catch (error) {
      if (requestedUserId !== getUserId()) return;
      if (presetStatus) {
        presetStatus.textContent = `Could not delete preset: ${formatPresetError(error)}`;
      }
    }
  }

  function setPresetEditorBusy(busy) {
    if (!presetEditor) return;
    for (const control of presetEditor.elements) control.disabled = busy;
    if (!busy && presetEditorSource === "session" && presetSourceSessions.length === 0) {
      if (presetSessionSelect) presetSessionSelect.disabled = true;
    }
  }

  // Helper function to format errors
  function formatPresetError(error) {
    if (error?.code === "23505") return "You already have a preset with this name.";
    if (error?.code === "23503") return "One of the selected exercises is no longer available.";
    return error?.message ?? "An unexpected error occurred.";
  }

  function resetPresets() {
    if (presetModal && presetModal.open) presetModal.close();
    document.body.classList.remove("preset-modal-open");
    presets = [];
    presetsLoadedForUser = null;
    presetsLoadingForUser = null;
    presetSourceSessions = [];
    presetSourceSessionsForUser = null;
    editingPresetId = null;
    presetEditorSource = null;
    selectedPresetExerciseIds = new Set();
    presetSetCounts = new Map();
    if (presetList) presetList.replaceChildren();
    if (presetStatus) presetStatus.textContent = "Loading your presets…";
    if (presetEmpty) presetEmpty.hidden = true;
    if (presetCreationChoices) presetCreationChoices.hidden = true;
    if (presetEditor) {
      presetEditor.hidden = true;
      presetEditor.reset();
    }
    if (presetSessionSource) presetSessionSource.hidden = true;
    if (presetSessionPreview) presetSessionPreview.hidden = true;
    if (presetSessionSelect) presetSessionSelect.replaceChildren();
    if (presetSelectedList) presetSelectedList.replaceChildren();
    if (presetExerciseResults) presetExerciseResults.replaceChildren();
    if (presetEditorStatus) presetEditorStatus.textContent = "";
  }

  async function openSessionPresetPicker() {
    if (sessionStartChoices) sessionStartChoices.hidden = true;
    if (sessionPresetPicker) sessionPresetPicker.hidden = false;
    if (sessionPresetStatus) sessionPresetStatus.textContent = "Loading your presets…";
    if (sessionPresetList) sessionPresetList.replaceChildren();

    const sessionModal = document.querySelector("#session-modal");
    if (sessionModal) {
      sessionModal.setAttribute("aria-labelledby", "session-preset-title");
    }

    const supabase = getClient();
    // lock modal inputs
    let controlsToDisable = [];
    if (sessionModal) {
      controlsToDisable = [...sessionModal.querySelectorAll("button, input, select, textarea")];
      for (const ctrl of controlsToDisable) ctrl.disabled = true;
    }

    try {
      await loadPresets(supabase, true);
      const requestedUserId = getUserId();
      if (presetsLoadedForUser !== requestedUserId) {
        if (sessionPresetStatus) {
          sessionPresetStatus.textContent = (presetStatus && presetStatus.textContent) || "Could not load your presets.";
        }
        return;
      }

      if (sessionPresetList) {
        const fragment = document.createDocumentFragment();
        for (const preset of presets) {
          const item = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.startPreset = preset.id;

          const name = document.createElement("strong");
          name.textContent = preset.name;
          const setTotal = preset.exercises.reduce((total, exercise) => total + exercise.setCount, 0);
          const summary = document.createElement("span");
          summary.textContent = `${preset.exercises.length} ${preset.exercises.length === 1 ? "exercise" : "exercises"} · ${setTotal} ${setTotal === 1 ? "set" : "sets"}`;
          const exercises = document.createElement("small");
          exercises.textContent = preset.exercises.map((exercise) => `${exercise.name} (${exercise.setCount})`).join(" · ");
          button.append(name, summary, exercises);

          item.append(button);
          fragment.append(item);
        }
        sessionPresetList.replaceChildren(fragment);
      }
      if (sessionPresetStatus) {
        sessionPresetStatus.textContent = presets.length
          ? "Choose the preset to populate this session."
          : "You do not have any presets yet.";
      }
      sessionPresetList?.querySelector("button")?.focus();
    } catch (error) {
      if (sessionPresetStatus) {
        sessionPresetStatus.textContent = `Could not prepare the preset picker: ${error.message}`;
      }
    } finally {
      for (const ctrl of controlsToDisable) ctrl.disabled = false;
    }
  }

  return {
    async load(force = false) {
      const supabase = getClient();
      if (supabase) {
        await loadPresets(supabase, force);
      }
    },
    reset() {
      resetPresets();
    },
    openCreate() {
      showPresetCreationChoices();
    },
    openSessionPresetPicker() {
      void openSessionPresetPicker();
    }
  };
}
