import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.0/+esm";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";
import { LITERATURE_DOCUMENTS, renderMarkdown } from "./literature.js";

const loadingView = document.querySelector("#loading");
const signedOutView = document.querySelector("#signed-out");
const signedInView = document.querySelector("#signed-in");
const signInButton = document.querySelector("#google-sign-in");
const publicDocumentSignInButton = document.querySelector("#public-document-sign-in");
const signInButtons = [signInButton, publicDocumentSignInButton];
const signOutButton = document.querySelector("#sign-out");
const errorMessage = document.querySelector("#auth-error");
const publicHome = document.querySelector("#public-home");
const publicDocumentPage = document.querySelector("#public-document-page");
const publicDocumentBack = document.querySelector("#public-document-back");
const publicDocumentLabel = document.querySelector("#public-document-label");
const publicDocumentTitle = document.querySelector("#public-document-title");
const publicDocumentStatus = document.querySelector("#public-document-status");
const publicDocumentContent = document.querySelector("#public-document-content");
const datasetStatus = document.querySelector("#dataset-status");
const exerciseStatus = document.querySelector("#exercise-status");
const exerciseCatalogue = document.querySelector("#exercise-catalogue");
const liftList = document.querySelector("#lift-list");
const loadMoreButton = document.querySelector("#load-more");
const muscleViewInputs = [...document.querySelectorAll('input[name="muscle-view"]')];
const menuToggle = document.querySelector("#menu-toggle");
const appMenu = document.querySelector("#app-menu");
const menuBackdrop = document.querySelector("#menu-backdrop");
const currentPageTitle = document.querySelector("#current-page-title");
const menuItems = [...document.querySelectorAll("[data-page]")];
const pagePanels = [...document.querySelectorAll("[data-page-panel]")];
const dashboardStatus = document.querySelector("#dashboard-status");
const metricGrid = document.querySelector("#metric-grid");
const sessionsChart = document.querySelector("#sessions-chart");
const workingSetsChart = document.querySelector("#working-sets-chart");
const exerciseChart = document.querySelector("#exercise-chart");
const documentBack = document.querySelector("#document-back");
const documentLabel = document.querySelector("#document-label");
const documentTitle = document.querySelector("#document-title");
const documentStatus = document.querySelector("#document-status");
const documentContent = document.querySelector("#document-content");
const pageSize = 20;
let loadedRows = 0;
let totalRows = 0;
let loadingRows = false;
let supabaseClient = null;
let activeUserId = null;
let dashboardLoadedForUser = null;
let dashboardLoadingForUser = null;
let documentRequestId = 0;
let exerciseMuscleLookup = new Map();
let exerciseMuscleLookupPromise = null;
let muscleViewMode = "ui";

menuToggle.addEventListener("click", () => {
  if (menuToggle.getAttribute("aria-expanded") === "true") {
    closeMenu();
  } else {
    openMenu();
  }
});

menuBackdrop.addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    closeMenu();
    menuToggle.focus();
  }
});

for (const menuItem of menuItems) {
  menuItem.addEventListener("click", () => showPage(menuItem.dataset.page));
}

for (const input of muscleViewInputs) {
  input.addEventListener("change", () => {
    if (input.checked) setMuscleViewMode(input.value);
  });
}

documentBack.addEventListener("click", () => showPage("literature"));
publicDocumentBack.addEventListener("click", () => showPublicHome());
document.addEventListener("click", (event) => {
  const documentLink = event.target.closest("[data-document]");
  if (!documentLink) return;
  event.preventDefault();
  if (signedInView.hidden) {
    void openPublicLiteratureDocument(documentLink.dataset.document);
  } else {
    void openLiteratureDocument(documentLink.dataset.document);
  }
});

window.addEventListener("popstate", () => {
  if (!signedInView.hidden) return;
  const documentId = new URLSearchParams(window.location.search).get("literature");
  if (documentId && LITERATURE_DOCUMENTS[documentId]) {
    void openPublicLiteratureDocument(documentId, false);
  } else {
    showPublicHome(false);
  }
});

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("__SUPABASE_") &&
  SUPABASE_PUBLISHABLE_KEY.length > 20 &&
  !SUPABASE_PUBLISHABLE_KEY.includes("__SUPABASE_");

if (!configured) {
  showSignedOut();
  showError("Supabase has not been configured yet.");
  setSignInDisabled(true);
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      detectSessionInUrl: true,
      flowType: "pkce",
      persistSession: true,
    },
  });
  supabaseClient = supabase;

  for (const button of signInButtons) button.addEventListener("click", async () => {
    clearError();
    setSignInDisabled(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("./", window.location.href).href,
      },
    });

    if (error) {
      showError(error.message);
      setSignInDisabled(false);
    }
  });

  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    const { error } = await supabase.auth.signOut();

    if (error) {
      showError(error.message);
      signOutButton.disabled = false;
    }
  });

  loadMoreButton.addEventListener("click", () => {
    void loadSessions(supabase);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    renderSession(session);
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showSignedOut();
    showError(error.message);
  } else {
    renderSession(data.session);
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The app still works online if service-worker registration is unavailable.
    });
  });
}

function renderSession(session) {
  if (session) {
    if (activeUserId === session.user.id && !signedInView.hidden) return;

    activeUserId = session.user.id;
    loadingView.hidden = true;
    signedOutView.hidden = true;
    signedInView.hidden = false;
    signOutButton.disabled = false;
    clearError();
    showPage("home");
    resetExerciseCatalogue();
    resetLiftList();
    resetDashboard();
    window.setTimeout(() => {
      void loadExerciseCatalogue(supabaseClient);
      void loadSessions(supabaseClient);
    }, 0);
    return;
  }

  showSignedOut();
}

function showSignedOut() {
  activeUserId = null;
  loadingView.hidden = true;
  signedInView.hidden = true;
  signedOutView.hidden = false;
  setSignInDisabled(false);
  closeMenu();
  resetExerciseCatalogue();
  resetLiftList();
  resetDashboard();
  const documentId = new URLSearchParams(window.location.search).get("literature");
  if (documentId && LITERATURE_DOCUMENTS[documentId]) {
    void openPublicLiteratureDocument(documentId, false);
  } else {
    showPublicHome(false);
  }
}

function setSignInDisabled(disabled) {
  for (const button of signInButtons) button.disabled = disabled;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
  if (!publicDocumentPage.hidden) {
    publicDocumentStatus.textContent = message;
    publicDocumentStatus.hidden = false;
  }
}

function clearError() {
  errorMessage.textContent = "";
  errorMessage.hidden = true;
}

function openMenu() {
  menuToggle.setAttribute("aria-expanded", "true");
  menuToggle.setAttribute("aria-label", "Close menu");
  menuBackdrop.hidden = false;
  appMenu.hidden = false;
  appMenu.inert = false;
  appMenu.setAttribute("aria-hidden", "false");
  appMenu.querySelector(".menu-item.is-active")?.focus();
}

function closeMenu() {
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open menu");
  menuBackdrop.hidden = true;
  appMenu.hidden = true;
  appMenu.inert = true;
  appMenu.setAttribute("aria-hidden", "true");
}

function showPage(pageName) {
  const pageTitles = {
    home: "Home",
    "session-history": "Session history",
    "my-data": "My data",
    literature: "Literature",
    document: "Literature",
  };
  const pageTitle = pageTitles[pageName] ?? "Home";
  const activeMenuPage = pageName === "document" ? "literature" : pageName;

  for (const panel of pagePanels) {
    panel.hidden = panel.dataset.pagePanel !== pageName;
  }

  for (const item of menuItems) {
    const isActive = item.dataset.page === activeMenuPage;
    item.classList.toggle("is-active", isActive);
    if (isActive) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }

  currentPageTitle.textContent = pageTitle;
  closeMenu();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (pageName === "my-data" && activeUserId && supabaseClient) {
    void loadDashboard(supabaseClient);
  }
}

async function openLiteratureDocument(documentId) {
  const documentDefinition = LITERATURE_DOCUMENTS[documentId];
  if (!documentDefinition) return;

  const requestId = ++documentRequestId;
  showPage("document");
  documentLabel.textContent = documentDefinition.label;
  documentTitle.textContent = documentDefinition.title;
  currentPageTitle.textContent = documentDefinition.title;
  documentStatus.textContent = "Loading document…";
  documentStatus.hidden = false;
  documentContent.replaceChildren();

  try {
    const response = await fetch(documentDefinition.path, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Document request failed (${response.status})`);
    const markdown = await response.text();
    if (requestId !== documentRequestId) return;
    documentContent.innerHTML = renderMarkdown(markdown);
    documentStatus.hidden = true;
  } catch (error) {
    if (requestId !== documentRequestId) return;
    documentStatus.textContent = `Could not load this document: ${error.message}`;
  }
}

async function openPublicLiteratureDocument(documentId, updateHistory = true) {
  const documentDefinition = LITERATURE_DOCUMENTS[documentId];
  if (!documentDefinition) return;

  const requestId = ++documentRequestId;
  publicHome.hidden = true;
  publicDocumentPage.hidden = false;
  publicDocumentLabel.textContent = documentDefinition.label;
  publicDocumentTitle.textContent = documentDefinition.title;
  publicDocumentStatus.textContent = "Loading document…";
  publicDocumentStatus.hidden = false;
  publicDocumentContent.replaceChildren();
  document.title = `${documentDefinition.title} | Lorenzo's Lifting Ledger`;
  if (updateHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set("literature", documentId);
    window.history.pushState({ literature: documentId }, "", url);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    const response = await fetch(documentDefinition.path, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Document request failed (${response.status})`);
    const markdown = await response.text();
    if (requestId !== documentRequestId) return;
    publicDocumentContent.innerHTML = renderMarkdown(markdown);
    publicDocumentStatus.hidden = true;
  } catch (error) {
    if (requestId !== documentRequestId) return;
    publicDocumentStatus.textContent = `Could not load this document: ${error.message}`;
  }
}

function showPublicHome(updateHistory = true) {
  documentRequestId += 1;
  publicDocumentPage.hidden = true;
  publicHome.hidden = false;
  document.title = "Lorenzo's Lifting Ledger | Evidence-aware training data";
  if (updateHistory) {
    const url = new URL(window.location.href);
    url.searchParams.delete("literature");
    window.history.pushState({}, "", url);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadDashboard(supabase) {
  const requestedUserId = activeUserId;
  if (
    !requestedUserId ||
    dashboardLoadedForUser === requestedUserId ||
    dashboardLoadingForUser === requestedUserId
  ) return;

  dashboardLoadingForUser = requestedUserId;
  dashboardStatus.textContent = "Loading your dashboard…";

  try {
    const [sessions, exercises, sets] = await Promise.all([
      fetchOwnedRows(supabase, "workout_sessions", "id, performed_on", requestedUserId),
      fetchOwnedRows(supabase, "session_exercises", "id, session_id, exercise", requestedUserId),
      fetchOwnedRows(
        supabase,
        "exercise_sets",
        "id, session_exercise_id, is_warmup",
        requestedUserId,
      ),
    ]);

    if (requestedUserId !== activeUserId) return;
    renderDashboard(sessions, exercises, sets);
    dashboardLoadedForUser = requestedUserId;
  } catch (error) {
    if (requestedUserId !== activeUserId) return;
    dashboardStatus.textContent = `Could not load your dashboard: ${error.message}`;
  } finally {
    if (dashboardLoadingForUser === requestedUserId) dashboardLoadingForUser = null;
  }
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

function renderDashboard(sessions, exercises, sets) {
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const monthlySessions = new Map();
  const monthlyWorkingSets = new Map();
  const exerciseSetCounts = new Map();
  let workingSetCount = 0;

  for (const session of sessions) {
    const month = session.performed_on.slice(0, 7);
    monthlySessions.set(month, (monthlySessions.get(month) ?? 0) + 1);
  }

  for (const set of sets) {
    if (set.is_warmup) continue;
    workingSetCount += 1;

    const exercise = exerciseById.get(set.session_exercise_id);
    if (exercise) {
      exerciseSetCounts.set(exercise.exercise, (exerciseSetCounts.get(exercise.exercise) ?? 0) + 1);
      const session = sessionById.get(exercise.session_id);
      if (session) {
        const month = session.performed_on.slice(0, 7);
        monthlyWorkingSets.set(month, (monthlyWorkingSets.get(month) ?? 0) + 1);
      }
    }
  }

  renderMetrics([
    { label: "Sessions", value: sessions.length.toLocaleString(), note: "Dated workout records" },
    { label: "Working sets", value: workingSetCount.toLocaleString(), note: "Warm-ups excluded" },
    { label: "Exercises trained", value: exerciseSetCounts.size.toLocaleString(), note: "With working sets" },
  ]);

  const monthKeys = getLatestMonthKeys(sessions, 12);
  renderVerticalChart(
    sessionsChart,
    monthKeys.map((month) => ({ label: formatMonthLabel(month), value: monthlySessions.get(month) ?? 0 })),
    (value) => value.toLocaleString(),
  );
  renderVerticalChart(
    workingSetsChart,
    monthKeys.map((month) => ({ label: formatMonthLabel(month), value: monthlyWorkingSets.get(month) ?? 0 })),
    (value) => value.toLocaleString(),
  );

  const topExercises = [...exerciseSetCounts]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 6);
  renderHorizontalChart(exerciseChart, topExercises);

  dashboardStatus.textContent = sessions.length
    ? `Based on ${sessions.length.toLocaleString()} sessions in your training history`
    : "No workout data yet";
}

function renderMetrics(metrics) {
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
    const note = document.createElement("p");
    note.className = "metric-note";
    note.textContent = metric.note;
    card.append(label, value, note);
    fragment.append(card);
  }

  metricGrid.replaceChildren(fragment);
}

function renderVerticalChart(container, values, formatValue) {
  if (!values.length) {
    renderEmptyChart(container, "Your monthly chart will appear after your first session.");
    return;
  }

  const maximum = Math.max(...values.map((item) => item.value), 1);
  const fragment = document.createDocumentFragment();

  for (const item of values) {
    const column = document.createElement("div");
    column.className = "vertical-bar-item";
    column.setAttribute("aria-label", `${item.label}: ${formatValue(item.value)}`);

    const track = document.createElement("div");
    track.className = "vertical-bar-track";
    const height = item.value === 0 ? 0 : Math.max((item.value / maximum) * 100, 3);
    track.style.setProperty("--bar-height", `${height}%`);

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = formatValue(item.value);
    const bar = document.createElement("span");
    bar.className = "vertical-bar";
    bar.style.height = `${height}%`;
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = item.label;
    track.append(value, bar);
    column.append(track, label);
    fragment.append(column);
  }

  container.replaceChildren(fragment);
}

function renderHorizontalChart(container, values) {
  if (!values.length) {
    renderEmptyChart(container, "Your most-trained exercises will appear here.");
    return;
  }

  const maximum = Math.max(...values.map((item) => item.value), 1);
  const fragment = document.createDocumentFragment();

  for (const item of values) {
    const row = document.createElement("div");
    row.className = "horizontal-bar-item";
    row.setAttribute("aria-label", `${item.label}: ${item.value.toLocaleString()} working sets`);
    const label = document.createElement("span");
    label.className = "horizontal-label";
    label.textContent = item.label;
    const track = document.createElement("span");
    track.className = "horizontal-track";
    const bar = document.createElement("span");
    bar.className = "horizontal-bar";
    bar.style.width = `${(item.value / maximum) * 100}%`;
    const value = document.createElement("span");
    value.className = "horizontal-value";
    value.textContent = item.value.toLocaleString();
    track.append(bar);
    row.append(label, track, value);
    fragment.append(row);
  }

  container.replaceChildren(fragment);
}

function renderEmptyChart(container, message) {
  const empty = document.createElement("p");
  empty.className = "empty-chart";
  empty.textContent = message;
  container.replaceChildren(empty);
}

function getLatestMonthKeys(sessions, count) {
  if (!sessions.length) return [];
  const latest = sessions.reduce(
    (current, session) => session.performed_on > current ? session.performed_on : current,
    sessions[0].performed_on,
  );
  const [year, month] = latest.slice(0, 7).split("-").map(Number);
  const keys = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return keys;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(" ", " ’");
}

async function loadExerciseCatalogue(supabase) {
  const requestedUserId = activeUserId;
  const batchSize = 1000;
  const exercises = [];
  let expectedCount = null;

  exerciseStatus.textContent = "Loading exercises…";
  exerciseCatalogue.replaceChildren();

  while (expectedCount === null || exercises.length < expectedCount) {
    const start = exercises.length;
    const { data, error, count } = await supabase
      .from("exercises")
      .select("id, code, name", { count: start === 0 ? "exact" : undefined })
      .eq("is_active", true)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + batchSize - 1);

    if (requestedUserId !== activeUserId) return;

    if (error) {
      exerciseStatus.textContent = `Could not load your exercises: ${error.message}`;
      return;
    }

    if (expectedCount === null) expectedCount = count ?? data.length;
    exercises.push(...data);
    if (data.length < batchSize) break;
  }

  const fragment = document.createDocumentFragment();
  for (const exercise of exercises) {
    const item = document.createElement("li");
    item.textContent = exercise.name;
    fragment.append(item);
  }

  exerciseCatalogue.append(fragment);
  exerciseStatus.textContent = `${exercises.length.toLocaleString()} global exercises · alphabetical`;
}

async function loadSessions(supabase) {
  if (loadingRows || loadedRows >= totalRows && totalRows !== 0) return;

  loadingRows = true;
  loadMoreButton.disabled = true;
  datasetStatus.textContent = loadedRows === 0 ? "Loading your sessions…" : `${totalRows.toLocaleString()} workout sessions`;

  const sessionRequest = supabase
    .from("workout_sessions")
    .select(
      "id, performed_on, gyms(name), session_exercises(id, exercise_id, exercise_order, exercise, equipment_id, exercise_sets(set_number, weight, reps, rpe, is_warmup, is_drop_set, is_superset, estimated_1rm_brzycki, estimated_1rm_epley, estimated_1rm_low, estimated_1rm_high))",
      { count: "exact" },
    )
    .eq("owner_id", activeUserId)
    .order("performed_on", { ascending: false })
    .order("id", { ascending: false })
    .range(loadedRows, loadedRows + pageSize - 1);

  const [sessionResult, muscleMappingError] = await Promise.all([
    sessionRequest,
    ensureExerciseMuscleLookup(supabase).then(() => null).catch((error) => error),
  ]);
  const { data, error, count } = sessionResult;

  loadingRows = false;

  if (error) {
    datasetStatus.textContent = `Could not load your sessions: ${error.message}`;
    loadMoreButton.hidden = true;
    return;
  }

  totalRows = count ?? data.length;
  appendSessionRows(data);
  loadedRows += data.length;
  datasetStatus.textContent = muscleMappingError
    ? `${totalRows.toLocaleString()} workout sessions · Muscle labels unavailable`
    : `${totalRows.toLocaleString()} workout sessions`;
  loadMoreButton.hidden = loadedRows >= totalRows;
  loadMoreButton.disabled = false;
}

function appendSessionRows(rows) {
  const fragment = document.createDocumentFragment();

  for (const session of rows) {
    const item = document.createElement("li");
    item.className = "session-item";

    const disclosure = document.createElement("details");
    disclosure.className = "session-entry";

    const summary = document.createElement("summary");
    summary.className = "session-summary";

    const summaryCopy = document.createElement("div");
    summaryCopy.className = "session-summary-copy";

    const heading = document.createElement("h2");
    heading.textContent = session.gyms?.name ?? "Gym";

    const exercises = [...session.session_exercises].sort(
      (a, b) => a.exercise_order - b.exercise_order,
    );
    const workingSetCount = exercises.reduce(
      (count, exercise) => count + exercise.exercise_sets.filter((set) => !set.is_warmup).length,
      0,
    );

    const context = document.createElement("p");
    context.className = "session-context";
    context.textContent = `${formatDate(session.performed_on)} · ${exercises.length} exercises · ${workingSetCount} working sets`;

    const sessionMuscleViews = createSessionMuscleViews(exercises);

    const exerciseList = document.createElement("ol");
    exerciseList.className = "exercise-list";

    for (const exercise of exercises) {
      exerciseList.append(createExerciseItem(exercise));
    }

    summaryCopy.append(heading, context);
    if (sessionMuscleViews) summaryCopy.append(sessionMuscleViews);
    summary.append(summaryCopy);
    disclosure.append(summary, exerciseList);
    item.append(disclosure);
    fragment.append(item);
  }

  liftList.append(fragment);
}

function createMusclePillList(muscles, view, scope) {
  const list = document.createElement("ul");
  list.className = "muscle-pill-list";
  list.dataset.muscleView = view;
  list.hidden = view !== muscleViewMode;
  list.setAttribute(
    "aria-label",
    `${scope} ${view === "ui" ? "simplified muscle groups" : "detailed muscle entities"}`,
  );

  for (const muscle of muscles) {
    const pill = document.createElement("li");
    pill.className = `muscle-pill muscle-group-${muscle.uiGroup.code}`;
    pill.textContent = muscle.name;
    pill.title = view === "detailed" ? `${muscle.uiGroup.name} · ${muscle.name}` : muscle.name;
    list.append(pill);
  }

  return list;
}

function createMuscleViews(muscles, containerClass, scope) {
  const detailedMuscles = [...new Map(
    muscles.map((muscle) => [muscle.name, muscle]),
  ).values()].sort(
    (a, b) => a.sourceOrder - b.sourceOrder || a.name.localeCompare(b.name),
  );
  if (detailedMuscles.length === 0) return null;

  const uiMuscles = [...new Map(
    detailedMuscles.map((muscle) => [muscle.uiGroup.code, {
      name: muscle.uiGroup.name,
      sourceOrder: muscle.uiGroup.sourceOrder,
      uiGroup: muscle.uiGroup,
    }]),
  ).values()].sort(
    (a, b) => a.sourceOrder - b.sourceOrder || a.name.localeCompare(b.name),
  );

  const container = document.createElement("div");
  container.className = containerClass;
  container.append(
    createMusclePillList(uiMuscles, "ui", scope),
    createMusclePillList(detailedMuscles, "detailed", scope),
  );
  return container;
}

function createSessionMuscleViews(exercises) {
  const muscles = exercises.flatMap((exercise) => (
    exercise.exercise_sets.some((set) => !set.is_warmup)
      ? exerciseMuscleLookup.get(exercise.exercise_id) ?? []
      : []
  ));
  return createMuscleViews(muscles, "session-muscles", "Session");
}

function createExerciseMuscleViews(exercise) {
  if (!exercise.exercise_sets.some((set) => !set.is_warmup)) return null;
  return createMuscleViews(
    exerciseMuscleLookup.get(exercise.exercise_id) ?? [],
    "exercise-muscles",
    "Exercise",
  );
}

function setMuscleViewMode(mode) {
  if (mode !== "ui" && mode !== "detailed") return;
  muscleViewMode = mode;
  for (const list of liftList.querySelectorAll("[data-muscle-view]")) {
    list.hidden = list.dataset.muscleView !== mode;
  }
}

async function ensureExerciseMuscleLookup(supabase) {
  if (exerciseMuscleLookupPromise) return exerciseMuscleLookupPromise;

  exerciseMuscleLookupPromise = (async () => {
    const { data: version, error: versionError } = await supabase
      .from("exercise_muscle_relevance_versions")
      .select("id")
      .eq("is_current", true)
      .single();
    if (versionError) throw versionError;

    const { data: muscles, error: muscleError } = await supabase
      .from("muscles")
      .select("id, name, source_order, ui_muscle_groups(code, name, source_order)")
      .eq("is_active", true)
      .order("source_order", { ascending: true });
    if (muscleError) throw muscleError;

    const coefficients = [];
    const batchSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("exercise_muscle_relevance_coefficients")
        .select("exercise_id, muscle_id")
        .eq("mapping_version_id", version.id)
        .gt("relevance", 0)
        .order("exercise_id", { ascending: true })
        .order("muscle_id", { ascending: true })
        .range(coefficients.length, coefficients.length + batchSize - 1);
      if (error) throw error;
      coefficients.push(...data);
      if (data.length < batchSize) break;
    }

    const muscleById = new Map(muscles.map((muscle) => [muscle.id, muscle]));
    const lookup = new Map();
    for (const coefficient of coefficients) {
      const muscle = muscleById.get(coefficient.muscle_id);
      if (!muscle?.ui_muscle_groups) continue;
      const mappedMuscles = lookup.get(coefficient.exercise_id) ?? [];
      mappedMuscles.push({
        name: muscle.name,
        sourceOrder: muscle.source_order,
        uiGroup: {
          code: muscle.ui_muscle_groups.code,
          name: muscle.ui_muscle_groups.name,
          sourceOrder: muscle.ui_muscle_groups.source_order,
        },
      });
      lookup.set(coefficient.exercise_id, mappedMuscles);
    }
    exerciseMuscleLookup = lookup;
  })().catch((error) => {
    exerciseMuscleLookupPromise = null;
    throw error;
  });

  return exerciseMuscleLookupPromise;
}

function createExerciseItem(exercise) {
  const item = document.createElement("li");
  item.className = "exercise-entry";

  const heading = document.createElement("h3");
  heading.textContent = exercise.exercise;

  const context = document.createElement("p");
  context.className = "exercise-context";
  const setCount = exercise.exercise_sets.length;
  context.textContent = [
    `${setCount} ${setCount === 1 ? "set" : "sets"}`,
    exercise.equipment_id ? `Equipment ${exercise.equipment_id}` : null,
  ].filter(Boolean).join(" · ");

  const sets = document.createElement("ul");
  sets.className = "set-list";

  const muscleViews = createExerciseMuscleViews(exercise);

  for (const set of [...exercise.exercise_sets].sort((a, b) => a.set_number - b.set_number)) {
    const setItem = document.createElement("li");
    const weight = set.weight === null ? "— kg" : `${Number(set.weight).toLocaleString()} kg`;
    const reps = set.reps === null ? "— reps" : `${set.reps} reps`;
    const labels = [
      formatOneRepMaxRange(set.estimated_1rm_low, set.estimated_1rm_high),
      set.is_warmup ? "Warm-up" : null,
      set.is_drop_set ? "Drop set" : null,
      set.is_superset ? "Superset" : null,
      set.rpe === null ? null : `RPE ${Number(set.rpe).toLocaleString()}`,
    ].filter(Boolean);
    setItem.textContent = `Set ${set.set_number}: ${weight} for ${reps}${labels.length ? ` · ${labels.join(" · ")}` : ""}`;
    sets.append(setItem);
  }

  item.append(heading, context);
  if (muscleViews) item.append(muscleViews);
  item.append(sets);
  return item;
}

function formatOneRepMaxRange(low, high) {
  if (low === null || high === null) return null;

  const lowLabel = Number(low).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const highLabel = Number(high).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return lowLabel === highLabel
    ? `Estimated 1RM ${lowLabel} kg`
    : `Estimated 1RM ${lowLabel}–${highLabel} kg`;
}

function resetLiftList() {
  loadedRows = 0;
  totalRows = 0;
  loadingRows = false;
  liftList.replaceChildren();
  loadMoreButton.hidden = true;
  loadMoreButton.disabled = false;
  datasetStatus.textContent = "Loading your sessions…";
}

function resetExerciseCatalogue() {
  exerciseCatalogue.replaceChildren();
  exerciseStatus.textContent = "Loading exercises…";
}

function resetDashboard() {
  dashboardLoadedForUser = null;
  dashboardLoadingForUser = null;
  dashboardStatus.textContent = "Loading your dashboard…";
  metricGrid.replaceChildren();
  sessionsChart.replaceChildren();
  workingSetsChart.replaceChildren();
  exerciseChart.replaceChildren();
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(year, month - 1, day));
}
