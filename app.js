import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.0/+esm";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";
import { LITERATURE_DOCUMENTS, renderMarkdown } from "./literature.js";
import { createBodyWeightFeature } from "./features/body-weight.js";
import { createPresetFeature } from "./features/presets.js";
import { createDashboardFeature } from "./features/dashboard.js";
import { createSessionFeature } from "./features/session/session-controller.js";
import { formatSetClassification, isAnalyticalWorkingSet } from "./set-model.js";

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
const startSessionButton = document.querySelector("#start-session");
const startSessionStatus = document.querySelector("#start-session-status");
const sessionModal = document.querySelector("#session-modal");
const closeSessionModalButton = document.querySelector("#close-session-modal");
const sessionStartChoices = document.querySelector("#session-start-choices");
const sessionFromPresetButton = document.querySelector("#session-from-preset");
const sessionFromScratchButton = document.querySelector("#session-from-scratch");
const sessionPresetPicker = document.querySelector("#session-preset-picker");
const backToSessionChoicesButton = document.querySelector("#back-to-session-choices");
const sessionInProgress = document.querySelector("#session-in-progress");
const concludeSessionButton = document.querySelector("#conclude-session");
const sessionModalStatus = document.querySelector("#session-modal-status");
const liftList = document.querySelector("#lift-list");
const loadMoreButton = document.querySelector("#load-more");
const sessionSearch = document.querySelector("#session-search");
const clearSessionSearchButton = document.querySelector("#clear-session-search");
const sessionExerciseOptions = document.querySelector("#session-exercise-options");
const muscleViewInputs = [...document.querySelectorAll('input[name="muscle-view"]')];
const menuToggle = document.querySelector("#menu-toggle");
const appMenu = document.querySelector("#app-menu");
const menuBackdrop = document.querySelector("#menu-backdrop");
const currentPageTitle = document.querySelector("#current-page-title");
const topBar = document.querySelector(".top-bar");
const menuItems = [...document.querySelectorAll("[data-page]")];
const pagePanels = [...document.querySelectorAll("[data-page-panel]")];
const documentBack = document.querySelector("#document-back");
const documentLabel = document.querySelector("#document-label");
const documentTitle = document.querySelector("#document-title");
const documentStatus = document.querySelector("#document-status");
const documentContent = document.querySelector("#document-content");
const pageSize = 20;
let loadedRows = 0;
let totalRows = 0;
let loadingRows = false;
let sessionSearchQuery = "";
let sessionSearchTimer = null;
let sessionRequestVersion = 0;
let supabaseClient = null;
let activeUserId = null;
let documentRequestId = 0;
let exerciseMuscleLookup = new Map();
let exerciseMuscleLookupPromise = null;
let muscleViewMode = "ui";
let activePageName = "home";
let globalExerciseCatalogue = [];
let globalExerciseCataloguePromise = null;
let activeWorkoutSession = null;
let activeSessionLoadedForUser = null;
let activeSessionLoadingForUser = null;
const liveSessionFeature = createSessionFeature({
  getClient: () => supabaseClient,
  getUserId: () => activeUserId,
  ensureExerciseCatalogue: () => ensureGlobalExerciseCatalogue(supabaseClient),
  onNavigate: (page) => showPage(page),
  onSessionConcluded: () => {
    activeWorkoutSession = null;
    activeSessionLoadedForUser = activeUserId;
    updateSessionButton();
    showPage("home");
    dashboardFeature.invalidate();
    if (activeUserId && supabaseClient) void loadSessions(supabaseClient);
  },
  onSessionCancelled: () => {
    activeWorkoutSession = null;
    activeSessionLoadedForUser = activeUserId;
    updateSessionButton();
    showPage("home");
    dashboardFeature.invalidate();
    if (activeUserId && supabaseClient) void loadSessions(supabaseClient);
  },
  liveContainer: typeof document !== "undefined" ? document.querySelector("#live-session-container") : null,
  wizardModal: typeof document !== "undefined" ? (document.querySelector("#session-wizard-modal") || document.querySelector("#session-modal")) : null,
});
const bodyWeightFeature = createBodyWeightFeature({
  getClient: () => supabaseClient,
  getUserId: () => activeUserId,
  onInvalidateE1rmPresentations: () => dashboardFeature.invalidate(),
});
const presetsFeature = createPresetFeature({
  getClient: () => supabaseClient,
  getUserId: () => activeUserId,
  ensureExerciseCatalogue: () => ensureGlobalExerciseCatalogue(supabaseClient),
  onStartPreset: (presetId, presetName) => {
    liveSessionFeature.openStartWizard(presetId, presetName);
  },
});
const dashboardFeature = createDashboardFeature({
  getClient: () => supabaseClient,
  getUserId: () => activeUserId,
  getActivePageName: () => activePageName,
  ensureExerciseMuscleLookup: (supabase) => ensureExerciseMuscleLookup(supabase),
  ensureBodyWeightState: () => bodyWeightFeature.ensureState(),
  getBodyWeightState: () => bodyWeightFeature.getState(),
});
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
document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-page-link]");
  if (link) showPage(link.dataset.pageLink);
});

for (const input of muscleViewInputs) {
  input.addEventListener("change", () => {
    if (input.checked) setMuscleViewMode(input.value);
  });
}
window.addEventListener("scroll", updateContextualNavTitle, { passive: true });
window.addEventListener("resize", updateContextualNavTitle);

sessionSearch.addEventListener("input", () => {
  clearSessionSearchButton.hidden = sessionSearch.value.length === 0;
  window.clearTimeout(sessionSearchTimer);
  sessionSearchTimer = window.setTimeout(() => {
    sessionSearchQuery = sessionSearch.value.trim();
    resetSessionResults();
    if (activeUserId && supabaseClient) void loadSessions(supabaseClient);
  }, 250);
});

clearSessionSearchButton.addEventListener("click", () => {
  window.clearTimeout(sessionSearchTimer);
  sessionSearch.value = "";
  sessionSearchQuery = "";
  clearSessionSearchButton.hidden = true;
  resetSessionResults();
  if (activeUserId && supabaseClient) void loadSessions(supabaseClient);
  sessionSearch.focus();
});
startSessionButton.addEventListener("click", startOrResumeSession);
closeSessionModalButton.addEventListener("click", closeSessionModal);
sessionFromScratchButton.addEventListener("click", () => createWorkoutSession());
sessionFromPresetButton.addEventListener("click", () => {
  presetsFeature.openSessionPresetPicker();
});
backToSessionChoicesButton.addEventListener("click", showSessionStartChoices);
concludeSessionButton.addEventListener("click", concludeActiveSession);
sessionModal.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeSessionModal();
});

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
    resetActiveSession();
    resetLiftList();
    dashboardFeature.reset();
    presetsFeature.reset();
    bodyWeightFeature.reset();
    window.setTimeout(() => {
      void loadActiveSession(supabaseClient);
      void ensureGlobalExerciseCatalogue(supabaseClient).then(populateSessionExerciseOptions).catch(() => {});
      void bodyWeightFeature.ensureState();
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
  resetActiveSession();
  resetLiftList();
  dashboardFeature.reset();
  presetsFeature.reset();
  bodyWeightFeature.reset();
  liveSessionFeature.reset();
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

const PAGE_TITLES = Object.freeze({
  home: "Home",
  "live-session": "Live Workout",
  "session-history": "Session history",
  "my-data": "My data",
  "my-stuff": "My Stuff",
  literature: "Literature",
  settings: "Settings",
  document: "Literature",
});

function showPage(pageName) {
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

  activePageName = pageName;
  currentPageTitle.textContent = "";
  closeMenu();
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.requestAnimationFrame(updateContextualNavTitle);
  if (pageName === "live-session" && activeUserId && supabaseClient) {
    void liveSessionFeature.load();
  }
  if (pageName === "session-history" && activeUserId && supabaseClient) {
    void loadSessions(supabaseClient);
  }
  if (pageName === "my-data" && activeUserId && supabaseClient) {
    void dashboardFeature.load();
  }
  if (pageName === "my-stuff" && activeUserId && supabaseClient) {
    void presetsFeature.load();
  }
  if (pageName === "settings" && activeUserId && supabaseClient) {
    void bodyWeightFeature.loadSummary();
  }
}

function updateContextualNavTitle() {
  if (!topBar) return;
  const activePanel = pagePanels.find((panel) => panel.dataset.pagePanel === activePageName);
  const heading = activePanel?.querySelector("h1, [data-page-heading-anchor]");
  const pageTitle = activePageName === "document"
    ? documentTitle.textContent || PAGE_TITLES.document
    : PAGE_TITLES[activePageName] ?? "Home";
  if (!heading) {
    currentPageTitle.textContent = pageTitle;
    return;
  }
  const headingBottom = heading.getBoundingClientRect().bottom;
  const topBarBottom = topBar.getBoundingClientRect().bottom;
  const isContextual = headingBottom <= topBarBottom;
  currentPageTitle.textContent = isContextual ? pageTitle : "";
  const contextualDashboardRange = document.querySelector("#contextual-dashboard-range");
  const dashboardPageRange = document.querySelector("#dashboard-page-range");
  const isDashboardRangeContextual = activePageName === "my-data" && isContextual;
  if (contextualDashboardRange) contextualDashboardRange.hidden = !isDashboardRangeContextual;
  if (dashboardPageRange) dashboardPageRange.hidden = isDashboardRangeContextual;
}
async function openLiteratureDocument(documentId) {
  const documentDefinition = LITERATURE_DOCUMENTS[documentId];
  if (!documentDefinition) return;

  const requestId = ++documentRequestId;
  showPage("document");
  documentLabel.textContent = documentDefinition.label;
  documentTitle.textContent = documentDefinition.title;
  window.requestAnimationFrame(updateContextualNavTitle);
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

async function ensureGlobalExerciseCatalogue(supabase) {
  if (globalExerciseCatalogue.length) return globalExerciseCatalogue;
  if (globalExerciseCataloguePromise) return globalExerciseCataloguePromise;

  globalExerciseCataloguePromise = (async () => {
    const exercises = [];
    const batchSize = 1000;
    let expectedCount = null;

    while (expectedCount === null || exercises.length < expectedCount) {
      const start = exercises.length;
      const { data, error, count } = await supabase
        .from("exercises")
        .select("id, code, name", { count: start === 0 ? "exact" : undefined })
        .eq("is_active", true)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(start, start + batchSize - 1);

      if (error) throw error;
      if (expectedCount === null) expectedCount = count ?? data.length;
      exercises.push(...data);
      if (data.length < batchSize) break;
    }

    globalExerciseCatalogue = exercises;
    return exercises;
  })().catch((error) => {
    globalExerciseCataloguePromise = null;
    throw error;
  });

  return globalExerciseCataloguePromise;
}

function populateSessionExerciseOptions(exercises) {
  const options = document.createDocumentFragment();
  for (const exercise of exercises) {
    const option = document.createElement("option");
    option.value = exercise.name;
    options.append(option);
  }
  sessionExerciseOptions.replaceChildren(options);
}

async function loadActiveSession(supabase) {
  const requestedUserId = activeUserId;
  if (!requestedUserId) return;
  if (activeSessionLoadedForUser === requestedUserId || activeSessionLoadingForUser === requestedUserId) return;

  activeSessionLoadingForUser = requestedUserId;
  setSessionButtonLoading(true);
  clearSessionWorkflowStatus();

  try {
    const session = await liveSessionFeature.load();
    if (requestedUserId !== activeUserId) return;
    activeSessionLoadingForUser = null;
    activeWorkoutSession = session;
    activeSessionLoadedForUser = requestedUserId;
    updateSessionButton();
  } catch (error) {
    if (requestedUserId !== activeUserId) return;
    activeSessionLoadingForUser = null;
    showSessionWorkflowError(`Could not load your active session: ${error.message}`);
    startSessionButton.textContent = "Create Session";
    startSessionButton.disabled = false;
  }
}

function startOrResumeSession() {
  if (activeWorkoutSession) {
    showPage("live-session");
  } else {
    liveSessionFeature.openStartWizard();
  }
}

function showSessionStartChoices() {
  sessionStartChoices.hidden = false;
  sessionPresetPicker.hidden = true;
  sessionInProgress.hidden = true;
  sessionModal.setAttribute("aria-labelledby", "session-modal-title");
  clearSessionWorkflowStatus();
  sessionFromPresetButton.focus();
}

function showSessionInProgress() {
  sessionStartChoices.hidden = true;
  sessionPresetPicker.hidden = true;
  sessionInProgress.hidden = false;
  sessionModal.setAttribute("aria-labelledby", "session-progress-title");
  clearSessionWorkflowStatus();
  concludeSessionButton.focus();
}

async function createWorkoutSession(presetId = null, presetName = null) {
  liveSessionFeature.openStartWizard(presetId, presetName);
}

function setSessionCreationBusy(busy) {
  sessionFromPresetButton.disabled = busy;
  sessionFromScratchButton.disabled = busy;
  backToSessionChoicesButton.disabled = busy;
  const sessionPresetList = document.querySelector("#session-preset-list");
  if (sessionPresetList) {
    for (const button of sessionPresetList.querySelectorAll("button")) button.disabled = busy;
  }
}

async function concludeActiveSession() {
  if (!activeWorkoutSession || !activeUserId || !supabaseClient) return;
  const concludingSessionId = activeWorkoutSession.id;
  concludeSessionButton.disabled = true;
  concludeSessionButton.textContent = "Concluding…";
  sessionModalStatus.hidden = true;

  const { error } = await supabaseClient
    .from("workout_sessions")
    .update({ status: "completed" })
    .eq("id", concludingSessionId)
    .eq("owner_id", activeUserId)
    .eq("status", "in_progress")
    .select("id")
    .single();

  concludeSessionButton.disabled = false;
  concludeSessionButton.textContent = "Conclude Session";
  if (error) {
    sessionModalStatus.textContent = `Could not conclude your session: ${error.message}`;
    sessionModalStatus.hidden = false;
    return;
  }

  activeWorkoutSession = null;
  closeSessionModal();
  updateSessionButton();
  resetSessionResults();
  dashboardFeature.invalidate();
}

function openSessionModal() {
  clearSessionWorkflowStatus();
  if (!sessionModal.open) sessionModal.showModal();
  document.body.classList.add("session-modal-open");
}

function closeSessionModal() {
  if (sessionModal.open) sessionModal.close();
  document.body.classList.remove("session-modal-open");
  sessionModalStatus.hidden = true;
}

function updateSessionButton() {
  startSessionButton.textContent = activeWorkoutSession ? "Resume Session" : "Create Session";
  startSessionButton.disabled = false;
  window.requestAnimationFrame(updateContextualNavTitle);
}

function setSessionButtonLoading(loading, label = "Loading session…") {
  startSessionButton.disabled = loading;
  if (loading) startSessionButton.textContent = label;
}

function showSessionWorkflowError(message) {
  startSessionStatus.textContent = message;
  startSessionStatus.hidden = false;
}

function clearSessionWorkflowStatus() {
  startSessionStatus.textContent = "";
  startSessionStatus.hidden = true;
  sessionModalStatus.textContent = "";
  sessionModalStatus.hidden = true;
}

async function loadSessions(supabase) {
  if (loadingRows || loadedRows >= totalRows && totalRows !== 0) return;
  const requestVersion = sessionRequestVersion;
  const requestedUserId = activeUserId;
  const requestedSearch = sessionSearchQuery;

  loadingRows = true;
  loadMoreButton.disabled = true;
  datasetStatus.textContent = loadedRows === 0 ? "Loading your sessions…" : `${totalRows.toLocaleString()} workout sessions`;

  let sessionRequest = supabase
    .from("workout_sessions")
    .select(
      `id, performed_on, status, gyms(name), session_exercises${requestedSearch ? "!inner" : ""}(id, exercise_id, exercise_order, equipment_id, exercises${requestedSearch ? "!inner" : ""}(name), gym_equipment_id, equipment_name_snapshot, gym_equipment(id, name), exercise_sets(id, set_number, weight, reps, is_warmup, reported_rir_bucket, rir_source, is_drop_set, is_superset, estimated_1rm_brzycki, estimated_1rm_epley, estimated_1rm_brzycki_rir_adjusted, estimated_1rm_epley_rir_adjusted))`,
      { count: "exact" },
    )
    .eq("owner_id", requestedUserId);

  if (requestedSearch) {
    sessionRequest = sessionRequest.ilike("session_exercises.exercises.name", `%${escapeLikePattern(requestedSearch)}%`);
  }

  sessionRequest = sessionRequest
    .order("performed_on", { ascending: false })
    .order("id", { ascending: false })
    .range(loadedRows, loadedRows + pageSize - 1);

  const [sessionResult, muscleMappingError, bodyWeightStateError] = await Promise.all([
    sessionRequest,
    ensureExerciseMuscleLookup(supabase).then(() => null).catch((error) => error),
    bodyWeightFeature.ensureState().then(() => null).catch((error) => error),
  ]);
  const { data, error, count } = sessionResult;

  if (requestVersion !== sessionRequestVersion || requestedUserId !== activeUserId) return;
  loadingRows = false;

  if (error) {
    datasetStatus.textContent = `Could not load your sessions: ${error.message}`;
    loadMoreButton.hidden = true;
    return;
  }

  totalRows = count ?? data.length;
  appendSessionRows(data);
  loadedRows += data.length;
  datasetStatus.textContent = [
    `${totalRows.toLocaleString()} workout sessions`,
    muscleMappingError ? "Muscle labels unavailable" : null,
    bodyWeightStateError ? "Relative e1RM unavailable" : null,
  ].filter(Boolean).join(" · ");
  loadMoreButton.hidden = loadedRows >= totalRows;
  if (requestedSearch) datasetStatus.textContent = formatSessionResultCount(totalRows, requestedSearch);
  loadMoreButton.disabled = false;
}


function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function formatSessionResultCount(count, query) {
  const label = `${count.toLocaleString()} ${count === 1 ? "workout session" : "workout sessions"}`;
  return query ? `${label} matching "${query}"` : label;
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
    heading.textContent = session.status === "in_progress" ? "Workout session" : session.gyms?.name ?? "Gym";

    const exercises = [...session.session_exercises].sort(
      (a, b) => a.exercise_order - b.exercise_order,
    );
    const setSlotCount = exercises.reduce(
      (count, exercise) => count + exercise.exercise_sets.length,
      0,
    );
    const workingSetCount = exercises.reduce(
      (count, exercise) => count + exercise.exercise_sets.filter((set) => (
        isAnalyticalWorkingSet(set)
      )).length,
      0,
    );

    const context = document.createElement("p");
    context.className = "session-context";
    context.textContent = session.status === "in_progress"
      ? `${formatDate(session.performed_on)} · ${exercises.length} exercises · ${setSlotCount} set slots`
      : `${formatDate(session.performed_on)} · ${exercises.length} exercises · ${workingSetCount} working sets`;

    const sessionMuscleViews = createSessionMuscleViews(exercises);

    const exerciseList = document.createElement("ol");
    exerciseList.className = "exercise-list";

    for (const exercise of exercises) {
      exerciseList.append(createExerciseItem(exercise, session.performed_on));
    }

    summaryCopy.append(heading);
    if (session.status === "in_progress") {
      const status = document.createElement("span");
      status.className = "session-status-badge";
      status.textContent = "In progress";
      summaryCopy.append(status);
    }
    summaryCopy.append(context);
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
    exercise.exercise_sets.some(isAnalyticalWorkingSet)
      ? exerciseMuscleLookup.get(exercise.exercise_id) ?? []
      : []
  ));
  return createMuscleViews(muscles, "session-muscles", "Session");
}

function createExerciseMuscleViews(exercise) {
  if (!exercise.exercise_sets.some(isAnalyticalWorkingSet)) return null;
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
        .select("exercise_id, muscle_id, relevance")
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
        relevance: Number(coefficient.relevance),
        uiGroup: {
          code: muscle.ui_muscle_groups.code,
          name: muscle.ui_muscle_groups.name,
          sourceOrder: muscle.ui_muscle_groups.source_order,
        },
      });
      lookup.set(coefficient.exercise_id, mappedMuscles);
    }
    exerciseMuscleLookup = lookup;
    return exerciseMuscleLookup;
  })().catch((error) => {
    exerciseMuscleLookupPromise = null;
    throw error;
  });

  return exerciseMuscleLookupPromise;
}

function createExerciseItem(exercise, performedOn) {
  const item = document.createElement("li");
  item.className = "exercise-entry";

  const heading = document.createElement("h3");
  heading.textContent = exercise.exercises.name;

  const headingRow = document.createElement("div");
  headingRow.className = "exercise-heading";
  const editButton = document.createElement("button");
  editButton.className = "exercise-edit-button";
  editButton.type = "button";
  editButton.textContent = "Edit";
  headingRow.append(heading, editButton);

  const context = document.createElement("p");
  context.className = "exercise-context";
  const setCount = exercise.exercise_sets.length;
  const equipmentName = exercise.equipment_name_snapshot || exercise.gym_equipment?.name || (exercise.equipment_id ? `Equipment ${exercise.equipment_id}` : null);
  context.textContent = [
    `${setCount} ${setCount === 1 ? "set" : "sets"}`,
    equipmentName,
  ].filter(Boolean).join(" · ");

  const sets = document.createElement("ul");
  sets.className = "set-list";

  const muscleViews = createExerciseMuscleViews(exercise);

  for (const set of [...exercise.exercise_sets].sort((a, b) => a.set_number - b.set_number)) {
    const setItem = document.createElement("li");
    const weightUnit = formatWeightUnit(exercise.exercises.name);
    const weight = set.weight === null ? `— ${weightUnit}` : `${Number(set.weight).toLocaleString()} ${weightUnit}`;
    const reps = set.reps === null ? "— reps" : `${set.reps} reps`;
    const labels = [
      formatSetClassification(set),
      set.is_drop_set ? "Drop set" : null,
      set.is_superset ? "Superset" : null,
    ].filter(Boolean);
    setItem.textContent = `Set ${set.set_number}: ${weight} for ${reps}${labels.length ? ` · ${labels.join(" · ")}` : ""}`;
    sets.append(setItem);
  }

  item.append(headingRow, context);
  if (muscleViews) item.append(muscleViews);
  item.append(sets);
  editButton.addEventListener("click", () => {
    showExerciseEditor(item, exercise, performedOn);
  });
  return item;
}

function showExerciseEditor(item, exercise, performedOn) {
  const form = document.createElement("form");
  form.className = "exercise-edit-form";

  const heading = document.createElement("h3");
  heading.textContent = `Edit ${exercise.exercises.name}`;

  const equipmentLabel = document.createElement("label");
  equipmentLabel.className = "exercise-edit-equipment";
  equipmentLabel.textContent = "Equipment ID";
  const equipmentInput = document.createElement("input");
  equipmentInput.type = "text";
  equipmentInput.value = exercise.equipment_id ?? "";
  equipmentInput.placeholder = "Not recorded";
  equipmentLabel.append(equipmentInput);

  const setFields = document.createElement("div");
  setFields.className = "exercise-edit-sets";
  const sortedSets = [...exercise.exercise_sets].sort((a, b) => a.set_number - b.set_number);

  for (const set of sortedSets) {
    const row = document.createElement("div");
    row.className = "exercise-edit-set";
    row.dataset.setId = set.id;

    const number = document.createElement("strong");
    number.textContent = `Set ${set.set_number}`;

    const weightLabel = document.createElement("label");
    weightLabel.textContent = `Weight (${formatWeightUnit(exercise.exercises.name)})`;
    const weightInput = document.createElement("input");
    weightInput.type = "number";
    weightInput.name = "weight";
    weightInput.min = "0";
    weightInput.step = "any";
    weightInput.inputMode = "decimal";
    weightInput.value = set.weight ?? "";
    weightLabel.append(weightInput);

    const repsLabel = document.createElement("label");
    repsLabel.textContent = "Reps";
    const repsInput = document.createElement("input");
    repsInput.type = "number";
    repsInput.name = "reps";
    repsInput.min = "0";
    repsInput.step = "1";
    repsInput.inputMode = "numeric";
    repsInput.value = set.reps ?? "";
    repsLabel.append(repsInput);

    const warmupLabel = document.createElement("label");
    const warmupInput = document.createElement("input");
    warmupInput.type = "checkbox";
    warmupInput.name = "is_warmup";
    warmupInput.checked = set.is_warmup === true;
    warmupLabel.append(warmupInput, " Warm-up set");

    const rirLabel = document.createElement("label");
    rirLabel.className = "exercise-edit-rir";
    rirLabel.textContent = "Reps in reserve (RIR)";
    const rirSelect = document.createElement("select");
    rirSelect.name = "reported_rir_bucket";
    rirSelect.required = !warmupInput.checked;
    const choices = [["", "Choose RIR"], ["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4+ — not counted as a working set"]];
    for (const [value, label] of choices) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = set.rir_source === "user_entered" && value !== "" && Number(value) === Number(set.reported_rir_bucket);
      rirSelect.append(option);
    }
    const syncRir = () => {
      rirLabel.hidden = warmupInput.checked;
      rirSelect.required = !warmupInput.checked;
      if (warmupInput.checked) rirSelect.value = "";
    };
    warmupInput.addEventListener("change", syncRir);
    syncRir();
    rirLabel.append(rirSelect);

    row.append(number, weightLabel, repsLabel, warmupLabel, rirLabel);
    setFields.append(row);
  }

  const status = document.createElement("p");
  status.className = "exercise-edit-status";
  status.setAttribute("role", "status");

  const actions = document.createElement("div");
  actions.className = "exercise-edit-actions";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Save";
  actions.append(cancelButton, saveButton);

  form.append(heading, equipmentLabel, setFields, status, actions);
  item.replaceChildren(form);
  equipmentInput.focus();

  cancelButton.addEventListener("click", () => {
    item.replaceWith(createExerciseItem(exercise, performedOn));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";

    const setUpdates = sortedSets.map((set) => {
      const row = setFields.querySelector(`[data-set-id="${set.id}"]`);
      const weightInput = row.querySelector('[name="weight"]');
      const repsInput = row.querySelector('[name="reps"]');
      const warmupInput = row.querySelector('[name="is_warmup"]');
      const rirSelect = row.querySelector('[name="reported_rir_bucket"]');
      weightInput.setCustomValidity("");
      repsInput.setCustomValidity("");
      const weight = weightInput.value === "" ? null : Number(weightInput.value);
      const reps = repsInput.value === "" ? null : Number(repsInput.value);
      const isWarmup = warmupInput.checked;
      const reportedRirBucket = isWarmup || rirSelect.value === "" ? null : Number(rirSelect.value);
      return { id: set.id, weight, reps, isWarmup, reportedRirBucket };
    });

    if (!form.reportValidity()) return;
    for (const control of form.elements) control.disabled = true;
    status.textContent = "Saving...";

    try {
      await saveExerciseChanges(exercise, equipmentInput.value.trim() || null, setUpdates);
      item.replaceWith(createExerciseItem(exercise, performedOn));
      datasetStatus.textContent = "Exercise saved. Estimated 1RM values updated.";
    } catch (error) {
      status.textContent = `Could not save changes: ${error.message}`;
      for (const control of form.elements) control.disabled = false;
    }
  });
}

async function saveExerciseChanges(exercise, equipmentId, setUpdates) {
  if (!supabaseClient || !activeUserId) throw new Error("You are no longer signed in.");
  const requestedUserId = activeUserId;
  const equipmentRequest = supabaseClient
    .from("session_exercises")
    .update({ equipment_id: equipmentId })
    .eq("id", exercise.id)
    .eq("owner_id", requestedUserId)
    .select("id, equipment_id")
    .single();

  const setRequests = setUpdates.map((set) => supabaseClient
    .from("exercise_sets")
    .update({ weight: set.weight, reps: set.reps, is_warmup: set.isWarmup, reported_rir_bucket: set.reportedRirBucket, rir_source: set.isWarmup ? null : "user_entered" })
    .eq("id", set.id)
    .eq("session_exercise_id", exercise.id)
    .eq("owner_id", requestedUserId)
    .select("id, weight, reps, is_warmup, reported_rir_bucket, rir_source, estimated_1rm_brzycki, estimated_1rm_epley, estimated_1rm_brzycki_rir_adjusted, estimated_1rm_epley_rir_adjusted")
    .single());

  const [equipmentResult, ...setResults] = await Promise.all([equipmentRequest, ...setRequests]);
  const failedResult = [equipmentResult, ...setResults].find((result) => result.error);
  if (failedResult) throw failedResult.error;
  if (requestedUserId !== activeUserId) throw new Error("Your session changed while saving.");

  exercise.equipment_id = equipmentResult.data.equipment_id;
  const savedSets = new Map(setResults.map((result) => [String(result.data.id), result.data]));
  for (const set of exercise.exercise_sets) {
    const saved = savedSets.get(String(set.id));
    if (saved) Object.assign(set, saved);
  }
  dashboardFeature.invalidate();
}

function formatOneRepMaxRange(low, high, exerciseName = "", performedOn = null) {
  return bodyWeightFeature.formatOneRepMaxRange(low, high, exerciseName, performedOn);
}

function formatWeightUnit(exerciseName) {
  return /\(Dumbbell\)/i.test(exerciseName ?? "") ? "kg per dumbbell" : "kg";
}

function resetSessionResults() {
  sessionRequestVersion += 1;
  loadedRows = 0;
  totalRows = 0;
  loadingRows = false;
  liftList.replaceChildren();
  loadMoreButton.hidden = true;
  loadMoreButton.disabled = false;
  datasetStatus.textContent = sessionSearchQuery ? `Searching for "${sessionSearchQuery}"...` : "Loading your sessions...";
}

function resetLiftList() {
  window.clearTimeout(sessionSearchTimer);
  sessionSearch.value = "";
  sessionSearchQuery = "";
  clearSessionSearchButton.hidden = true;
  resetSessionResults();
  totalRows = 0;
  loadingRows = false;
  liftList.replaceChildren();
  loadMoreButton.hidden = true;
  loadMoreButton.disabled = false;
  datasetStatus.textContent = "Loading your sessions…";
}

function resetActiveSession() {
  activeWorkoutSession = null;
  activeSessionLoadedForUser = null;
  activeSessionLoadingForUser = null;
  setSessionCreationBusy(false);
  closeSessionModal();
  clearSessionWorkflowStatus();
  setSessionButtonLoading(true);
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(year, month - 1, day));
}
