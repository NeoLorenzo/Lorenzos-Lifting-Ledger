import { formatPreviousPerformanceSummary, formatPreviousSetBadge } from "./session-history-context.js";

function formatDateLong(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(year, month - 1, day));
}

function formatWeightUnit(exerciseName) {
  return /\(Dumbbell\)/i.test(exerciseName ?? "") ? "kg per dumbbell" : "kg";
}

function createRirSelect(sessionId, set, onSetFieldChange, onSetFieldBlur) {
  const rirSelect = document.createElement("select");
  rirSelect.className = "live-select rir-select";
  rirSelect.setAttribute("aria-label", `Set ${set.set_number} RIR`);
  const rirChoices = [
    ["", "—"],
    ["0", "0"],
    ["1", "1"],
    ["2", "2"],
    ["3", "3"],
    ["4", "4+"],
  ];
  for (const [val, label] of rirChoices) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    if (val !== "" && set.reported_rir_bucket !== null && set.reported_rir_bucket !== undefined && Number(val) === Number(set.reported_rir_bucket)) {
      opt.selected = true;
    }
    rirSelect.append(opt);
  }
  rirSelect.addEventListener("change", () => {
    const val = rirSelect.value === "" ? null : Number(rirSelect.value);
    onSetFieldChange(sessionId, set.id, {
      reported_rir_bucket: val,
      rir_source: val !== null ? "user_entered" : null,
    });
    onSetFieldBlur(sessionId, set.id);
  });
  return rirSelect;
}

export function createSessionRenderer(options) {
  const {
    container,
    onSetFieldChange,
    onSetFieldBlur,
    onAddSet,
    onRemoveSet,
    onAddExercise,
    onRemoveExercise,
    onReorderExercise,
    onEquipmentChange,
    onCreateEquipment,
    onConcludeSession,
    onCancelSession,
  } = options;

  return {
    updateSyncBadge(syncState, syncLabel) {
      if (!container) return;
      const badge = container.querySelector(".live-sync-badge");
      if (badge) {
        badge.className = `live-sync-badge sync-state-${syncState || "saved"}`;
        badge.textContent = syncLabel || "Saved ✓";
      }
    },

    updateErrorMessage(errorMessage) {
      if (!container) return;
      let errorBanner = container.querySelector(".live-error-banner");
      if (errorMessage) {
        if (!errorBanner) {
          const header = container.querySelector(".live-session-header");
          if (header) {
            errorBanner = document.createElement("div");
            errorBanner.className = "live-error-banner";
            errorBanner.setAttribute("role", "alert");
            header.append(errorBanner);
          }
        }
        if (errorBanner) {
          errorBanner.textContent = errorMessage;
          errorBanner.hidden = false;
        }
      } else if (errorBanner) {
        errorBanner.remove();
      }
    },

    renderLiveSession(state) {
      if (!container) return;
      container.replaceChildren();

      const {
        session,
        exercises,
        gyms,
        equipmentByGym,
        equipmentOptionsByExercise,
        historyContextByExercise,
        syncLabel,
        syncState,
        errorMessage,
        isConcluding,
      } = state;

      const currentGym = gyms.find((g) => String(g.id) === String(session.gym_id));
      const gymName = currentGym ? currentGym.name : "Gym";
      const sessionTitle = session.source_preset_name || "Live Workout";

      // Top header
      const header = document.createElement("header");
      header.className = "live-session-header";

      const titleRow = document.createElement("div");
      titleRow.className = "live-session-title-row";

      const titleLockup = document.createElement("div");
      const title = document.createElement("h1");
      title.className = "live-session-title";
      title.textContent = sessionTitle;

      const meta = document.createElement("p");
      meta.className = "live-session-meta";
      meta.textContent = `${gymName} · ${formatDateLong(session.performed_on)}`;

      titleLockup.append(title, meta);

      const syncBadge = document.createElement("span");
      syncBadge.className = `live-sync-badge sync-state-${syncState || "saved"}`;
      syncBadge.textContent = syncLabel || "Saved ✓";
      syncBadge.setAttribute("role", "status");
      syncBadge.setAttribute("aria-live", "polite");

      titleRow.append(titleLockup, syncBadge);
      header.append(titleRow);

      if (errorMessage) {
        const errorBanner = document.createElement("div");
        errorBanner.className = "live-error-banner";
        errorBanner.setAttribute("role", "alert");
        errorBanner.textContent = errorMessage;
        header.append(errorBanner);
      }

      container.append(header);

      // Exercise cards list
      const exerciseList = document.createElement("div");
      exerciseList.className = "live-exercise-list";

      const sortedExercises = [...exercises].sort((a, b) => a.exercise_order - b.exercise_order);

      sortedExercises.forEach((exercise, index) => {
        const exerciseCard = document.createElement("section");
        exerciseCard.className = "live-exercise-card";
        exerciseCard.dataset.sessionExerciseId = exercise.id;

        const cardHeader = document.createElement("div");
        cardHeader.className = "live-exercise-card-header";

        const exerciseHeading = document.createElement("h2");
        exerciseHeading.className = "live-exercise-name";
        exerciseHeading.textContent = exercise.exercises?.name || exercise.exercise_name || "Exercise";

        const headerActions = document.createElement("div");
        headerActions.className = "live-exercise-header-actions";

        const upButton = document.createElement("button");
        upButton.type = "button";
        upButton.className = "icon-button live-order-up";
        upButton.textContent = "↑";
        upButton.title = "Move exercise up";
        upButton.setAttribute("aria-label", `Move ${exerciseHeading.textContent} up`);
        upButton.disabled = index === 0;
        upButton.addEventListener("click", () => onReorderExercise(exercise.id, "up"));

        const downButton = document.createElement("button");
        downButton.type = "button";
        downButton.className = "icon-button live-order-down";
        downButton.textContent = "↓";
        downButton.title = "Move exercise down";
        downButton.setAttribute("aria-label", `Move ${exerciseHeading.textContent} down`);
        downButton.disabled = index === sortedExercises.length - 1;
        downButton.addEventListener("click", () => onReorderExercise(exercise.id, "down"));

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "text-button danger-link live-exercise-remove";
        removeButton.textContent = "Remove";
        removeButton.setAttribute("aria-label", `Remove ${exerciseHeading.textContent}`);
        removeButton.addEventListener("click", () => onRemoveExercise(exercise.id));

        headerActions.append(upButton, downButton, removeButton);
        cardHeader.append(exerciseHeading, headerActions);
        exerciseCard.append(cardHeader);

        // Equipment Selector (Exercise-specific)
        const equipmentRow = document.createElement("div");
        equipmentRow.className = "live-equipment-picker-row";

        const equipmentLabel = document.createElement("label");
        equipmentLabel.className = "live-equipment-label";
        equipmentLabel.textContent = "Machine / Equipment";

        const equipmentSelect = document.createElement("select");
        equipmentSelect.className = "live-equipment-select";
        equipmentSelect.setAttribute("aria-label", `Equipment for ${exerciseHeading.textContent}`);

        const noneOption = document.createElement("option");
        noneOption.value = "";
        noneOption.textContent = "— Select machine / equipment —";
        equipmentSelect.append(noneOption);

        const exerciseEquip = equipmentOptionsByExercise?.get(exercise.exercise_id) || [];
        const historicalEquipList = exerciseEquip.filter((eq) => eq.is_active !== false);
        const historicalIds = new Set(historicalEquipList.map((eq) => String(eq.id)));

        const otherGymEquip = (equipmentByGym.get(session.gym_id) || [])
          .filter((eq) => eq.is_active && !historicalIds.has(String(eq.id)));

        if (historicalEquipList.length > 0) {
          const optGroupHistorical = document.createElement("optgroup");
          optGroupHistorical.label = "Used with this exercise";
          for (const eq of historicalEquipList) {
            const option = document.createElement("option");
            option.value = String(eq.id);
            option.textContent = eq.name;
            if (String(exercise.gym_equipment_id) === String(eq.id)) {
              option.selected = true;
            }
            optGroupHistorical.append(option);
          }
          equipmentSelect.append(optGroupHistorical);
        }

        if (otherGymEquip.length > 0) {
          const optGroupOther = document.createElement("optgroup");
          optGroupOther.label = historicalEquipList.length > 0 ? "Other machines at this gym" : "Machines at this gym";
          for (const eq of otherGymEquip) {
            const option = document.createElement("option");
            option.value = String(eq.id);
            option.textContent = eq.name;
            if (String(exercise.gym_equipment_id) === String(eq.id)) {
              option.selected = true;
            }
            optGroupOther.append(option);
          }
          equipmentSelect.append(optGroupOther);
        }

        if (exercise.gym_equipment_id && !historicalIds.has(String(exercise.gym_equipment_id)) && !otherGymEquip.some((eq) => String(eq.id) === String(exercise.gym_equipment_id))) {
          const option = document.createElement("option");
          option.value = String(exercise.gym_equipment_id);
          option.textContent = exercise.equipment_name_snapshot || "Current machine";
          option.selected = true;
          equipmentSelect.append(option);
        }

        const addOption = document.createElement("option");
        addOption.value = "__ADD_NEW__";
        addOption.textContent = "+ Add new machine…";
        equipmentSelect.append(addOption);

        equipmentSelect.addEventListener("change", (e) => {
          if (e.target.value === "__ADD_NEW__") {
            const newName = window.prompt("Enter new machine or equipment name for this gym:");
            if (newName && newName.trim()) {
              onCreateEquipment(exercise.id, session.gym_id, newName.trim());
            } else {
              equipmentSelect.value = exercise.gym_equipment_id ? String(exercise.gym_equipment_id) : "";
            }
          } else {
            const selectedId = e.target.value ? Number(e.target.value) : null;
            onEquipmentChange(exercise.id, selectedId);
          }
        });

        equipmentLabel.append(equipmentSelect);
        equipmentRow.append(equipmentLabel);
        exerciseCard.append(equipmentRow);

        // Previous Performance Card
        const historyInfo = historyContextByExercise.get(exercise.id);
        const historySummary = formatPreviousPerformanceSummary(historyInfo, exerciseHeading.textContent);

        const historyCard = document.createElement("div");
        historyCard.className = `live-history-callout ${historySummary.hasHistory ? "has-history" : "no-history"}`;

        const historyHeading = document.createElement("strong");
        historyHeading.className = "live-history-heading";
        historyHeading.textContent = historySummary.heading;
        historyCard.append(historyHeading);

        if (historySummary.hasHistory && historySummary.setList.length > 0) {
          const historySetList = document.createElement("ul");
          historySetList.className = "live-history-sets";
          for (const setText of historySummary.setList) {
            const li = document.createElement("li");
            li.textContent = setText;
            historySetList.append(li);
          }
          historyCard.append(historySetList);
        }
        exerciseCard.append(historyCard);

        // Sets Table
        const setsContainer = document.createElement("div");
        setsContainer.className = "live-sets-container";

        const table = document.createElement("table");
        table.className = "live-sets-table";

        const thead = document.createElement("thead");
        thead.innerHTML = `
          <tr>
            <th scope="col" class="col-set">Set</th>
            <th scope="col" class="col-prev">Previous</th>
            <th scope="col" class="col-weight">Weight (${formatWeightUnit(exerciseHeading.textContent)})</th>
            <th scope="col" class="col-reps">Reps</th>
            <th scope="col" class="col-rir">RIR</th>
            <th scope="col" class="col-warmup">Warmup</th>
            <th scope="col" class="col-action"></th>
          </tr>
        `;
        table.append(thead);

        const tbody = document.createElement("tbody");
        const sortedSets = [...(exercise.exercise_sets || [])].sort((a, b) => a.set_number - b.set_number);

        sortedSets.forEach((set, setIdx) => {
          const row = document.createElement("tr");
          row.className = `live-set-row ${set.is_warmup ? "is-warmup-set" : ""}`;
          row.dataset.setId = set.id;

          // Set number
          const tdNum = document.createElement("td");
          tdNum.className = "col-set cell-set-num";
          tdNum.textContent = String(set.set_number);

          // Previous performance badge
          const tdPrev = document.createElement("td");
          tdPrev.className = "col-prev cell-prev";
          const prevSet = historyInfo?.sets?.[setIdx] || null;
          tdPrev.textContent = formatPreviousSetBadge(prevSet);

          // Weight input
          const tdWeight = document.createElement("td");
          tdWeight.className = "col-weight";
          const weightInput = document.createElement("input");
          weightInput.type = "number";
          weightInput.inputMode = "decimal";
          weightInput.step = "any";
          weightInput.min = "0";
          weightInput.placeholder = "—";
          weightInput.className = "live-input weight-input";
          weightInput.setAttribute("aria-label", `Set ${set.set_number} weight`);
          weightInput.value = set.weight !== null && set.weight !== undefined ? set.weight : "";
          weightInput.addEventListener("input", () => {
            const val = weightInput.value === "" ? null : Number(weightInput.value);
            set.weight = val;
            onSetFieldChange(session.id, set.id, { weight: val });
          });
          weightInput.addEventListener("blur", () => {
            onSetFieldBlur(session.id, set.id);
          });
          tdWeight.append(weightInput);

          // Reps input
          const tdReps = document.createElement("td");
          tdReps.className = "col-reps";
          const repsInput = document.createElement("input");
          repsInput.type = "number";
          repsInput.inputMode = "numeric";
          repsInput.step = "1";
          repsInput.min = "0";
          repsInput.placeholder = "—";
          repsInput.className = "live-input reps-input";
          repsInput.setAttribute("aria-label", `Set ${set.set_number} reps`);
          repsInput.value = set.reps !== null && set.reps !== undefined ? set.reps : "";
          repsInput.addEventListener("input", () => {
            const val = repsInput.value === "" ? null : Number(repsInput.value);
            set.reps = val;
            onSetFieldChange(session.id, set.id, { reps: val });
          });
          repsInput.addEventListener("blur", () => {
            onSetFieldBlur(session.id, set.id);
          });
          tdReps.append(repsInput);

          // RIR cell
          const tdRir = document.createElement("td");
          tdRir.className = "col-rir";
          if (!set.is_warmup) {
            tdRir.append(createRirSelect(session.id, set, onSetFieldChange, onSetFieldBlur));
          } else {
            const blankSpan = document.createElement("span");
            blankSpan.className = "rir-warmup-blank";
            blankSpan.setAttribute("aria-hidden", "true");
            tdRir.append(blankSpan);
          }

          // Warmup checkbox
          const tdWarmup = document.createElement("td");
          tdWarmup.className = "col-warmup";
          const warmupCheckbox = document.createElement("input");
          warmupCheckbox.type = "checkbox";
          warmupCheckbox.className = "live-checkbox warmup-checkbox";
          warmupCheckbox.setAttribute("aria-label", `Set ${set.set_number} warm-up`);
          warmupCheckbox.checked = set.is_warmup === true;
          warmupCheckbox.addEventListener("change", () => {
            const isWarmup = warmupCheckbox.checked;
            set.is_warmup = isWarmup;
            set.reported_rir_bucket = null;
            set.rir_source = null;
            row.classList.toggle("is-warmup-set", isWarmup);
            tdRir.replaceChildren();

            if (isWarmup) {
              const blankSpan = document.createElement("span");
              blankSpan.className = "rir-warmup-blank";
              blankSpan.setAttribute("aria-hidden", "true");
              tdRir.append(blankSpan);
              onSetFieldChange(session.id, set.id, {
                is_warmup: true,
                reported_rir_bucket: null,
                rir_source: null,
              });
            } else {
              tdRir.append(createRirSelect(session.id, set, onSetFieldChange, onSetFieldBlur));
              onSetFieldChange(session.id, set.id, {
                is_warmup: false,
                reported_rir_bucket: null,
                rir_source: null,
              });
            }
            onSetFieldBlur(session.id, set.id);
          });
          tdWarmup.append(warmupCheckbox);

          // Delete set action
          const tdAction = document.createElement("td");
          tdAction.className = "col-action";
          const removeSetBtn = document.createElement("button");
          removeSetBtn.type = "button";
          removeSetBtn.className = "icon-button delete-set-btn";
          removeSetBtn.textContent = "×";
          removeSetBtn.title = `Delete Set ${set.set_number}`;
          removeSetBtn.setAttribute("aria-label", `Delete Set ${set.set_number}`);
          removeSetBtn.addEventListener("click", () => onRemoveSet(exercise.id, set.id));
          tdAction.append(removeSetBtn);

          row.append(tdNum, tdPrev, tdWeight, tdReps, tdRir, tdWarmup, tdAction);
          tbody.append(row);
        });

        table.append(tbody);
        setsContainer.append(table);

        const addSetBtn = document.createElement("button");
        addSetBtn.type = "button";
        addSetBtn.className = "text-button add-set-button";
        addSetBtn.textContent = "+ Add set";
        addSetBtn.addEventListener("click", () => onAddSet(exercise.id));
        setsContainer.append(addSetBtn);

        exerciseCard.append(setsContainer);
        exerciseList.append(exerciseCard);
      });

      container.append(exerciseList);

      // Bottom footer actions
      const footerActions = document.createElement("footer");
      footerActions.className = "live-session-footer";

      const leftActions = document.createElement("div");
      leftActions.className = "live-footer-left";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "text-button danger-link cancel-session-button";
      cancelBtn.textContent = "Cancel workout";
      cancelBtn.addEventListener("click", onCancelSession);
      leftActions.append(cancelBtn);

      const rightActions = document.createElement("div");
      rightActions.className = "live-footer-right";

      const addExerciseBtn = document.createElement("button");
      addExerciseBtn.type = "button";
      addExerciseBtn.className = "secondary-button add-exercise-button";
      addExerciseBtn.textContent = "+ Add exercise";
      addExerciseBtn.addEventListener("click", onAddExercise);

      const concludeBtn = document.createElement("button");
      concludeBtn.type = "button";
      concludeBtn.className = "primary-button conclude-session-button";
      concludeBtn.textContent = isConcluding ? "Concluding…" : "Conclude workout";
      concludeBtn.disabled = isConcluding;
      concludeBtn.addEventListener("click", onConcludeSession);

      rightActions.append(addExerciseBtn, concludeBtn);
      footerActions.append(leftActions, rightActions);
      container.append(footerActions);
    },
  };
}
