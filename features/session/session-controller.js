import { createSessionStorage } from "./session-storage.js";
import { createSessionAutosave, SYNC_STATE, SYNC_LABELS } from "./session-autosave.js";
import { createSessionHistoryContext } from "./session-history-context.js";
import { createSessionRenderer } from "./session-rendering.js";
import { fetchRecentExerciseIds, fetchRecentGymIds } from "./session-recents.js";
import { isDraftSet } from "../../set-model.js";

export function createSessionFeature(options) {
  const {
    getClient,
    getUserId,
    ensureExerciseCatalogue,
    onNavigate,
    onSessionConcluded,
    onSessionCancelled,
    liveContainer,
    wizardModal,
  } = options;

  const storage = options.storage || createSessionStorage();
  const historyContext = options.historyContext || createSessionHistoryContext({
    getClient,
    getUserId,
  });

  let activeSession = null;
  let activeExercises = [];
  let gyms = [];
  let equipmentByGym = new Map();
  let equipmentOptionsByExercise = new Map();
  let historyContextByExercise = new Map();
  let syncState = SYNC_STATE.SAVED;
  let syncLabel = SYNC_LABELS[SYNC_STATE.SAVED];
  let errorMessage = "";
  let isConcluding = false;
  let renderer = null;

  // Wizard state
  let selectedGymId = null;
  let selectedPresetId = null;

  const autosave = createSessionAutosave({
    getClient,
    getUserId,
    storage,
    onSyncStateChange: (state, label) => {
      syncState = state;
      syncLabel = label;
      if (renderer) {
        renderer.updateSyncBadge(state, label);
      }
    },
  });

  function renderCurrent() {
    if (renderer && activeSession) {
      renderer.renderLiveSession({
        session: activeSession,
        exercises: activeExercises,
        gyms,
        equipmentByGym,
        equipmentOptionsByExercise,
        historyContextByExercise,
        syncState,
        syncLabel,
        errorMessage,
        isConcluding,
      });
    }
  }

  renderer = createSessionRenderer({
    container: liveContainer,
    onSetFieldChange: (sessionId, setId, fields) => {
      errorMessage = "";
      if (renderer) {
        renderer.updateErrorMessage("");
      }
      // Update in-memory state
      for (const ex of activeExercises) {
        const targetSet = (ex.exercise_sets || []).find((s) => s.id === setId);
        if (targetSet) {
          Object.assign(targetSet, fields);
          break;
        }
      }
      autosave.queueSetEdit(sessionId, setId, fields);
    },
    onSetFieldBlur: (sessionId, setId) => {
      void autosave.flushPendingEdits(sessionId);
    },
    onAddSet: async (sessionExerciseId) => {
      await addSet(sessionExerciseId);
    },
    onRemoveSet: async (sessionExerciseId, setId) => {
      await removeSet(sessionExerciseId, setId);
    },
    onAddExercise: () => {
      openAddExercisePicker();
    },
    onRemoveExercise: async (sessionExerciseId) => {
      await removeExercise(sessionExerciseId);
    },
    onReorderExercise: async (sessionExerciseId, direction) => {
      await reorderExercise(sessionExerciseId, direction);
    },
    onEquipmentChange: async (sessionExerciseId, gymEquipmentId) => {
      await changeEquipment(sessionExerciseId, gymEquipmentId);
    },
    onCreateEquipment: async (sessionExerciseId, gymId, name) => {
      await createEquipment(sessionExerciseId, gymId, name);
    },
    onConcludeSession: async () => {
      await concludeActiveSession();
    },
    onCancelSession: () => {
      openCancelConfirmation();
    },
  });

  async function loadGyms(force = false) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId) return [];
    if (gyms.length && !force) return gyms;

    const [gymResult, equipResult] = await Promise.all([
      supabase.from("gyms").select("id, name, created_at").eq("owner_id", userId).order("name", { ascending: true }),
      supabase.from("gym_equipment").select("id, gym_id, name, is_active").eq("owner_id", userId).eq("is_active", true).order("name", { ascending: true }),
    ]);

    if (gymResult.data) gyms = gymResult.data;
    if (equipResult.data) {
      const map = new Map();
      for (const eq of equipResult.data) {
        const list = map.get(eq.gym_id) || [];
        list.push(eq);
        map.set(eq.gym_id, list);
      }
      equipmentByGym = map;
    }
    return gyms;
  }

  async function loadEquipmentOptionsForExercises() {
    if (!activeSession || !activeExercises.length) return;
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId) return;

    equipmentOptionsByExercise.clear();
    const uniqueExerciseIds = [...new Set(activeExercises.map((e) => e.exercise_id))];

    try {
      const { data, error } = await supabase
        .from("session_exercises")
        .select(`
          exercise_id,
          gym_equipment_id,
          equipment_name_snapshot,
          gym_equipment(id, name, is_active),
          workout_sessions!inner(
            id,
            owner_id,
            gym_id,
            performed_on,
            status,
            created_at
          )
        `)
        .eq("workout_sessions.owner_id", userId)
        .eq("workout_sessions.gym_id", activeSession.gym_id)
        .eq("workout_sessions.status", "completed")
        .in("exercise_id", uniqueExerciseIds)
        .not("gym_equipment_id", "is", null)
        .order("performed_on", { foreignTable: "workout_sessions", ascending: false })
        .order("created_at", { foreignTable: "workout_sessions", ascending: false })
        .order("id", { foreignTable: "workout_sessions", ascending: false });

      if (!error && data) {
        for (const exId of uniqueExerciseIds) {
          const exerciseRows = data.filter((row) => row.exercise_id === exId);
          const seenIds = new Set();
          const options = [];
          for (const row of exerciseRows) {
            if (!row.gym_equipment_id || seenIds.has(row.gym_equipment_id)) continue;
            seenIds.add(row.gym_equipment_id);
            const eq = row.gym_equipment;
            if (eq && eq.is_active) {
              options.push({ id: eq.id, name: eq.name, is_active: true });
            } else if (row.equipment_name_snapshot) {
              options.push({ id: row.gym_equipment_id, name: row.equipment_name_snapshot, is_active: false });
            }
          }
          equipmentOptionsByExercise.set(exId, options);
        }
      }
    } catch {
      // Fallback
    }
  }

  async function loadActiveSession() {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId) return null;

    const { data: sessionData, error: sessionError } = await supabase
      .from("workout_sessions")
      .select("id, owner_id, gym_id, performed_on, status, source_preset_id, source_preset_name, created_at")
      .eq("owner_id", userId)
      .eq("status", "in_progress")
      .limit(1)
      .maybeSingle();

    if (sessionError || !sessionData) {
      activeSession = null;
      activeExercises = [];
      return null;
    }

    activeSession = sessionData;
    await loadGyms();

    const { data: exerciseData, error: exerciseError } = await supabase
      .from("session_exercises")
      .select(`
        id,
        session_id,
        exercise_order,
        exercise_id,
        gym_equipment_id,
        equipment_name_snapshot,
        exercises(id, name),
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
      .eq("session_id", activeSession.id)
      .eq("owner_id", userId)
      .order("exercise_order", { ascending: true });

    if (exerciseError) {
      errorMessage = `Could not load workout exercises: ${exerciseError.message}`;
      return activeSession;
    }

    activeExercises = exerciseData || [];

    // Reconcile pending local edits
    const pendingEdits = storage.getPendingSetEdits(activeSession.id);
    for (const pending of pendingEdits) {
      for (const ex of activeExercises) {
        const set = (ex.exercise_sets || []).find((s) => s.id === pending.setId);
        if (set) {
          Object.assign(set, pending.fields);
        }
      }
    }

    // Load exercise-specific equipment options and history context
    await Promise.all([
      loadEquipmentOptionsForExercises(),
      refreshHistoryContext(),
    ]);

    renderCurrent();
    return activeSession;
  }

  async function refreshHistoryContext() {
    if (!activeSession) return;
    historyContextByExercise.clear();
    const promises = activeExercises.map(async (ex) => {
      const history = await historyContext.fetchPreviousPerformance(
        activeSession.gym_id,
        ex.exercise_id,
        ex.gym_equipment_id,
        activeSession.id
      );
      historyContextByExercise.set(ex.id, history);
    });
    await Promise.all(promises);
  }

  async function addSet(sessionExerciseId) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId || !activeSession) return;

    const exercise = activeExercises.find((e) => e.id === sessionExerciseId);
    if (!exercise) return;

    const currentSets = exercise.exercise_sets || [];
    const nextSetNumber = currentSets.length + 1;

    try {
      const { data, error } = await supabase
        .from("exercise_sets")
        .insert({
          owner_id: userId,
          session_exercise_id: sessionExerciseId,
          set_number: nextSetNumber,
          weight: null,
          reps: null,
          is_warmup: false,
          reported_rir_bucket: null,
          rir_source: null,
        })
        .select()
        .single();

      if (error) throw error;
      currentSets.push(data);
      renderCurrent();
    } catch (error) {
      errorMessage = `Could not add set: ${error.message}`;
      await loadActiveSession();
      renderCurrent();
    }
  }

  async function removeSet(sessionExerciseId, setId) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId || !activeSession) return;

    const exercise = activeExercises.find((e) => e.id === sessionExerciseId);
    if (!exercise) return;

    try {
      const { error: delError } = await supabase
        .from("exercise_sets")
        .delete()
        .eq("id", setId)
        .eq("owner_id", userId);

      if (delError) throw delError;

      storage.removePendingSetEdit(activeSession.id, setId);

      // Remaining sets renumbering
      exercise.exercise_sets = (exercise.exercise_sets || []).filter((s) => s.id !== setId);
      exercise.exercise_sets.sort((a, b) => a.set_number - b.set_number);

      for (let i = 0; i < exercise.exercise_sets.length; i++) {
        const newNum = i + 1;
        if (exercise.exercise_sets[i].set_number !== newNum) {
          exercise.exercise_sets[i].set_number = newNum;
          await supabase
            .from("exercise_sets")
            .update({ set_number: newNum })
            .eq("id", exercise.exercise_sets[i].id)
            .eq("owner_id", userId);
        }
      }
      renderCurrent();
    } catch (error) {
      errorMessage = `Could not delete set: ${error.message}`;
      await loadActiveSession();
      renderCurrent();
    }
  }

  async function addExerciseToActiveSession(exerciseId) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId || !activeSession) return;

    const nextOrder = activeExercises.length + 1;

    try {
      // Resolve default equipment from history
      const history = await historyContext.fetchPreviousPerformance(
        activeSession.gym_id,
        exerciseId,
        null,
        activeSession.id
      );
      const defaultEquipmentId = history?.gymEquipmentId || null;
      let equipSnapshot = null;
      if (defaultEquipmentId) {
        const gymEquips = equipmentByGym.get(activeSession.gym_id) || [];
        const found = gymEquips.find((e) => e.id === defaultEquipmentId);
        equipSnapshot = found ? found.name : null;
      }

      const { data: exData, error: exError } = await supabase
        .from("session_exercises")
        .insert({
          owner_id: userId,
          session_id: activeSession.id,
          exercise_order: nextOrder,
          exercise_id: exerciseId,
          gym_equipment_id: defaultEquipmentId,
          equipment_name_snapshot: equipSnapshot,
        })
        .select(`
          id,
          session_id,
          exercise_order,
          exercise_id,
          gym_equipment_id,
          equipment_name_snapshot,
          exercises(id, name)
        `)
        .single();

      if (exError) throw exError;

      // Add 1 initial blank set slot
      const { data: setData, error: setError } = await supabase
        .from("exercise_sets")
        .insert({
          owner_id: userId,
          session_exercise_id: exData.id,
          set_number: 1,
          weight: null,
          reps: null,
          is_warmup: false,
          reported_rir_bucket: null,
          rir_source: null,
        })
        .select()
        .single();

      if (setError) throw setError;

      exData.exercise_sets = [setData];
      activeExercises.push(exData);

      await Promise.all([
        loadEquipmentOptionsForExercises(),
        refreshHistoryContext(),
      ]);

      renderCurrent();
    } catch (error) {
      errorMessage = `Could not add exercise: ${error.message}`;
      await loadActiveSession();
      renderCurrent();
    }
  }

  async function removeExercise(sessionExerciseId) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId || !activeSession) return;

    const exercise = activeExercises.find((e) => e.id === sessionExerciseId);
    if (!exercise) return;

    const hasData = (exercise.exercise_sets || []).some((s) => s.weight !== null || s.reps !== null);
    if (hasData) {
      const confirmDelete = window.confirm(`Remove ${exercise.exercises?.name || "this exercise"} and its entered data?`);
      if (!confirmDelete) return;
    }

    try {
      const { error } = await supabase
        .from("session_exercises")
        .delete()
        .eq("id", sessionExerciseId)
        .eq("owner_id", userId);

      if (error) throw error;

      activeExercises = activeExercises.filter((e) => e.id !== sessionExerciseId);
      const remainingIds = activeExercises.map((e) => e.id);
      if (remainingIds.length) {
        await supabase.rpc("reorder_session_exercises", {
          p_session_id: activeSession.id,
          p_exercise_ids: remainingIds,
        });
      }
      await loadActiveSession();
    } catch (error) {
      errorMessage = `Could not remove exercise: ${error.message}`;
      await loadActiveSession();
      renderCurrent();
    }
  }

  async function reorderExercise(sessionExerciseId, direction) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId || !activeSession) return;

    const sorted = [...activeExercises].sort((a, b) => a.exercise_order - b.exercise_order);
    const currentIndex = sorted.findIndex((e) => e.id === sessionExerciseId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const temp = sorted[currentIndex];
    sorted[currentIndex] = sorted[targetIndex];
    sorted[targetIndex] = temp;

    const newOrderIds = sorted.map((e) => e.id);

    try {
      const { error } = await supabase.rpc("reorder_session_exercises", {
        p_session_id: activeSession.id,
        p_exercise_ids: newOrderIds,
      });

      if (error) throw error;
      await loadActiveSession();
    } catch (error) {
      errorMessage = `Could not reorder exercises: ${error.message}`;
      await loadActiveSession();
      renderCurrent();
    }
  }

  async function changeEquipment(sessionExerciseId, gymEquipmentId) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId || !activeSession) return;

    const exercise = activeExercises.find((e) => e.id === sessionExerciseId);
    if (!exercise) return;

    let snapshotName = null;
    if (gymEquipmentId) {
      const gymEquips = equipmentByGym.get(activeSession.gym_id) || [];
      const eq = gymEquips.find((item) => item.id === gymEquipmentId);
      snapshotName = eq ? eq.name : null;
    }

    try {
      const { error } = await supabase
        .from("session_exercises")
        .update({
          gym_equipment_id: gymEquipmentId,
          equipment_name_snapshot: snapshotName,
        })
        .eq("id", sessionExerciseId)
        .eq("owner_id", userId);

      if (error) throw error;

      exercise.gym_equipment_id = gymEquipmentId;
      exercise.equipment_name_snapshot = snapshotName;

      const history = await historyContext.fetchPreviousPerformance(
        activeSession.gym_id,
        exercise.exercise_id,
        gymEquipmentId,
        activeSession.id
      );
      historyContextByExercise.set(exercise.id, history);
      renderCurrent();
    } catch (error) {
      errorMessage = `Could not update equipment: ${error.message}`;
      renderCurrent();
    }
  }

  async function createEquipment(sessionExerciseId, gymId, name) {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId || !activeSession) return;

    try {
      const { data, error } = await supabase.rpc("create_or_get_gym_equipment", {
        p_gym_id: gymId,
        p_name: name,
      });
      if (error) throw error;

      await loadGyms(true);
      await loadEquipmentOptionsForExercises();
      await changeEquipment(sessionExerciseId, data.id);
    } catch (error) {
      errorMessage = `Could not create machine: ${error.message}`;
      renderCurrent();
    }
  }

  async function concludeActiveSession() {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId || !activeSession) return;

    // Check for draft sets locally first
    const hasLocalDraft = activeExercises.some((ex) => (ex.exercise_sets || []).some(isDraftSet));
    if (hasLocalDraft) {
      errorMessage = "Cannot conclude session: complete or remove partially entered draft sets first.";
      renderCurrent();
      return;
    }

    isConcluding = true;
    errorMessage = "";
    renderCurrent();

    try {
      // 1. Flush pending autosaves
      await autosave.flushPendingEdits(activeSession.id);

      // 2. Call server-side atomic conclusion
      const { data, error } = await supabase.rpc("conclude_workout_session", {
        p_session_id: activeSession.id,
      });

      if (error) throw error;

      storage.clearPendingSessionEdits(activeSession.id);
      const concludedSessionId = activeSession.id;
      activeSession = null;
      activeExercises = [];
      historyContextByExercise.clear();
      equipmentOptionsByExercise.clear();
      isConcluding = false;

      if (onSessionConcluded) {
        onSessionConcluded(concludedSessionId);
      }
    } catch (error) {
      isConcluding = false;
      errorMessage = error.message.includes("incomplete drafts")
        ? "Cannot conclude session: one or more sets are incomplete drafts. Please complete or delete them."
        : `Could not conclude session: ${error.message}`;
      renderCurrent();
    }
  }

  function openCancelConfirmation() {
    const cancelModal = typeof document !== "undefined" ? document.querySelector("#cancel-workout-modal") : null;
    if (cancelModal) {
      const keepBtn = cancelModal.querySelector("#keep-workout-button");
      const confirmBtn = cancelModal.querySelector("#confirm-cancel-workout-button");

      if (keepBtn) {
        keepBtn.onclick = () => {
          cancelModal.close();
        };
      }
      if (confirmBtn) {
        confirmBtn.onclick = async () => {
          cancelModal.close();
          await cancelActiveWorkoutSession();
        };
      }
      cancelModal.showModal();
    } else {
      const confirmed = window.confirm("Cancel this workout? Your in-progress workout session and all logged set data will be discarded.");
      if (confirmed) {
        void cancelActiveWorkoutSession();
      }
    }
  }

  async function cancelActiveWorkoutSession() {
    const supabase = getClient();
    const userId = getUserId();
    if (!supabase || !userId || !activeSession) return;

    const targetSessionId = activeSession.id;

    // 1. Abort pending autosave timers and requests immediately so no delayed write fires during cancellation
    autosave.abort();

    // 2. Invoke server cancellation RPC while preserving local pending mutations
    try {
      const { error } = await supabase.rpc("cancel_workout_session", {
        p_session_id: targetSessionId,
      });

      if (error) throw error;

      // 3. Only after successful RPC confirmation:
      // - clear local pending mutations for the session
      storage.clearPendingSessionEdits(targetSessionId);

      // - clear active in-memory state
      activeSession = null;
      activeExercises = [];
      historyContextByExercise.clear();
      equipmentOptionsByExercise.clear();
      errorMessage = "";

      if (liveContainer) liveContainer.replaceChildren();

      if (onSessionCancelled) {
        onSessionCancelled(targetSessionId);
      }
      if (onNavigate) {
        onNavigate("home");
      }
    } catch (error) {
      // 4. If cancellation fails:
      // - do NOT clear locally persisted workout edits
      // - keep the active workout open
      // - surface an error to the user
      errorMessage = `Could not cancel workout: ${error.message}`;
      renderCurrent();
    }
  }

  async function openAddExercisePicker() {
    const modal = document.querySelector("#add-exercise-modal");
    const searchInput = document.querySelector("#add-exercise-search");
    const resultsList = document.querySelector("#add-exercise-results");
    const closeBtn = document.querySelector("#close-add-exercise-modal");

    if (!modal || !resultsList) return;

    const supabase = getClient();
    const userId = getUserId();

    const [catalogue, recentExerciseIds] = await Promise.all([
      ensureExerciseCatalogue(),
      fetchRecentExerciseIds(supabase, userId, 8),
    ]);

    function createExerciseItem(ex) {
      const li = document.createElement("li");
      li.className = "catalogue-exercise-item";

      const span = document.createElement("span");
      span.className = "catalogue-exercise-name";
      span.textContent = ex.name;

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "secondary-button compact catalogue-add-btn";
      addBtn.textContent = "+ Add";
      addBtn.setAttribute("aria-label", `Add ${ex.name}`);

      addBtn.addEventListener("click", () => {
        addBtn.textContent = "Added ✓";
        addBtn.classList.add("is-added");
        void addExerciseToActiveSession(ex.id);
        window.setTimeout(() => {
          addBtn.textContent = "+ Add";
          addBtn.classList.remove("is-added");
        }, 1500);
      });

      li.append(span, addBtn);
      return li;
    }

    function renderList(query = "") {
      const frag = document.createDocumentFragment();
      const trimmed = query.trim().toLowerCase();

      if (trimmed) {
        const matches = catalogue.filter((ex) => ex.name.toLowerCase().includes(trimmed));
        if (matches.length === 0) {
          const noRes = document.createElement("li");
          noRes.className = "catalogue-no-results";
          noRes.textContent = `No exercises match “${query}”`;
          frag.append(noRes);
        } else {
          for (const ex of matches) {
            frag.append(createExerciseItem(ex));
          }
        }
      } else {
        const recentExercises = (recentExerciseIds || [])
          .map((id) => catalogue.find((ex) => ex.id === id))
          .filter(Boolean);

        if (recentExercises.length > 0) {
          const recentHeader = document.createElement("li");
          recentHeader.className = "catalogue-section-header";
          recentHeader.textContent = "Recent";
          frag.append(recentHeader);

          for (const ex of recentExercises) {
            frag.append(createExerciseItem(ex));
          }

          const allHeader = document.createElement("li");
          allHeader.className = "catalogue-section-header";
          allHeader.textContent = "All exercises";
          frag.append(allHeader);
        }

        for (const ex of catalogue) {
          frag.append(createExerciseItem(ex));
        }
      }

      resultsList.replaceChildren(frag);
    }

    renderList();
    if (searchInput) {
      searchInput.value = "";
      searchInput.oninput = () => renderList(searchInput.value);
    }
    if (closeBtn) {
      closeBtn.onclick = () => modal.close();
    }
    modal.showModal();
    searchInput?.focus();
  }

  // Wizard Methods
  async function openCreationWizard() {
    selectedGymId = null;
    selectedPresetId = null;
    await loadGyms(true);
    await showWizardGymStep();
  }

  async function showWizardGymStep() {
    if (!wizardModal) return;
    wizardModal.replaceChildren();

    const supabase = getClient();
    const userId = getUserId();
    const recentGymIds = await fetchRecentGymIds(supabase, userId, 3);

    const container = document.createElement("div");
    container.className = "session-wizard-card wizard-gym-card";

    const title = document.createElement("h2");
    title.textContent = "Select Gym";

    const desc = document.createElement("p");
    desc.className = "wizard-desc";
    desc.textContent = "Choose your gym context to automatically match machines and track gym-specific history.";

    container.append(title, desc);

    function createGymButton(gym) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wizard-gym-button";

      const nameSpan = document.createElement("span");
      nameSpan.textContent = gym.name;

      const arrowSpan = document.createElement("span");
      arrowSpan.className = "wizard-gym-arrow";
      arrowSpan.setAttribute("aria-hidden", "true");
      arrowSpan.textContent = "›";

      btn.append(nameSpan, arrowSpan);
      btn.addEventListener("click", () => {
        selectedGymId = gym.id;
        showWizardPresetStep();
      });
      li.append(btn);
      return li;
    }

    const recentGyms = (recentGymIds || [])
      .map((id) => gyms.find((g) => g.id === id))
      .filter(Boolean);

    if (recentGyms.length > 0 && gyms.length > 1) {
      const recentHeading = document.createElement("h3");
      recentHeading.className = "wizard-section-title";
      recentHeading.textContent = "Recent";
      container.append(recentHeading);

      const recentList = document.createElement("ul");
      recentList.className = "wizard-gym-list";
      for (const gym of recentGyms) {
        recentList.append(createGymButton(gym));
      }
      container.append(recentList);

      const allHeading = document.createElement("h3");
      allHeading.className = "wizard-section-title";
      allHeading.textContent = "All Gyms";
      container.append(allHeading);
    }

    const gymList = document.createElement("ul");
    gymList.className = "wizard-gym-list";
    for (const gym of gyms) {
      gymList.append(createGymButton(gym));
    }
    container.append(gymList);

    // De-emphasized Add New Gym section
    const addGymSection = document.createElement("div");
    addGymSection.className = "wizard-add-gym-section";

    const toggleNewGymBtn = document.createElement("button");
    toggleNewGymBtn.type = "button";
    toggleNewGymBtn.className = "text-button wizard-toggle-add-gym";
    toggleNewGymBtn.textContent = "+ Add new gym";

    const newGymForm = document.createElement("form");
    newGymForm.className = "wizard-new-gym-form";
    newGymForm.hidden = true;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Enter gym name…";
    input.required = true;
    input.className = "live-input";

    const formActions = document.createElement("div");
    formActions.className = "wizard-form-actions";

    const addGymBtn = document.createElement("button");
    addGymBtn.type = "submit";
    addGymBtn.className = "primary-button compact";
    addGymBtn.textContent = "Add Gym";

    const cancelAddGymBtn = document.createElement("button");
    cancelAddGymBtn.type = "button";
    cancelAddGymBtn.className = "text-button";
    cancelAddGymBtn.textContent = "Cancel";
    cancelAddGymBtn.addEventListener("click", () => {
      newGymForm.hidden = true;
      newGymForm.reset();
      toggleNewGymBtn.hidden = false;
    });

    toggleNewGymBtn.addEventListener("click", () => {
      toggleNewGymBtn.hidden = true;
      newGymForm.hidden = false;
      input.focus();
    });

    formActions.append(addGymBtn, cancelAddGymBtn);
    newGymForm.append(input, formActions);

    newGymForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;
      const { data, error } = await supabase
        .from("gyms")
        .insert({ owner_id: userId, name: val })
        .select()
        .single();
      if (data) {
        await loadGyms(true);
        selectedGymId = data.id;
        showWizardPresetStep();
      }
    });

    addGymSection.append(toggleNewGymBtn, newGymForm);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "text-button wizard-close-btn";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => wizardModal.close());

    container.append(addGymSection, closeBtn);
    wizardModal.replaceChildren(container);
    if (!wizardModal.open) wizardModal.showModal();
  }

  async function showWizardPresetStep() {
    if (!wizardModal) return;
    wizardModal.replaceChildren();

    const container = document.createElement("div");
    container.className = "session-wizard-card wizard-preset-card";

    const title = document.createElement("h2");
    title.textContent = "Select Workout";

    const desc = document.createElement("p");
    desc.className = "wizard-desc";
    desc.textContent = "Start from an existing preset or build from scratch.";

    const supabase = getClient();
    const userId = getUserId();
    const { data: presets } = await supabase
      .from("workout_presets")
      .select("id, name, workout_preset_exercises(exercise_id, set_count)")
      .eq("owner_id", userId)
      .order("name", { ascending: true });

    const presetList = document.createElement("ul");
    presetList.className = "wizard-preset-list";

    for (const preset of presets || []) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wizard-preset-button";

      const infoDiv = document.createElement("div");
      infoDiv.className = "wizard-preset-info";

      const name = document.createElement("strong");
      name.className = "wizard-preset-name";
      name.textContent = preset.name;

      const count = document.createElement("span");
      count.className = "wizard-preset-count";
      const exCount = (preset.workout_preset_exercises || []).length;
      count.textContent = `${exCount} ${exCount === 1 ? "exercise" : "exercises"}`;

      infoDiv.append(name, count);

      const arrowSpan = document.createElement("span");
      arrowSpan.className = "wizard-preset-arrow";
      arrowSpan.setAttribute("aria-hidden", "true");
      arrowSpan.textContent = "›";

      btn.append(infoDiv, arrowSpan);
      btn.addEventListener("click", () => {
        selectedPresetId = preset.id;
        void createSessionAndLaunch(selectedGymId, selectedPresetId);
      });
      li.append(btn);
      presetList.append(li);
    }

    const scratchBtn = document.createElement("button");
    scratchBtn.type = "button";
    scratchBtn.className = "secondary-button wizard-scratch-button";
    scratchBtn.textContent = "Start empty workout";
    scratchBtn.addEventListener("click", () => {
      void createSessionAndLaunch(selectedGymId, null);
    });

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "text-button wizard-back-btn";
    backBtn.textContent = "← Back to Gyms";
    backBtn.addEventListener("click", () => void showWizardGymStep());

    container.append(title, desc, presetList, scratchBtn, backBtn);
    wizardModal.replaceChildren(container);
  }

  async function createSessionAndLaunch(gymId, presetId) {
    const supabase = getClient();
    if (!supabase) return;

    if (wizardModal && wizardModal.open) wizardModal.close();

    try {
      const { data, error } = await supabase.rpc("start_or_resume_workout_session", {
        p_gym_id: gymId,
        p_preset_id: presetId,
      });

      if (error) throw error;
      await loadActiveSession();
      if (onNavigate) onNavigate("live-session");
    } catch (error) {
      alert(`Could not start workout: ${error.message}`);
    }
  }

  return {
    getActiveSession() {
      return activeSession;
    },
    async load() {
      return await loadActiveSession();
    },
    openStartWizard(presetId = null, presetName = null) {
      if (activeSession) {
        if (onNavigate) onNavigate("live-session");
      } else {
        void openCreationWizard();
      }
    },
    async cancelSession() {
      await cancelActiveWorkoutSession();
    },
    reset() {
      activeSession = null;
      activeExercises = [];
      gyms = [];
      equipmentByGym.clear();
      equipmentOptionsByExercise.clear();
      historyContextByExercise.clear();
      errorMessage = "";
      isConcluding = false;
      if (wizardModal && wizardModal.open) wizardModal.close();
      if (liveContainer) liveContainer.replaceChildren();
    },
  };
}
