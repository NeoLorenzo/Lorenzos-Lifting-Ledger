import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.0/+esm";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

const loadingView = document.querySelector("#loading");
const signedOutView = document.querySelector("#signed-out");
const signedInView = document.querySelector("#signed-in");
const signInButton = document.querySelector("#google-sign-in");
const signOutButton = document.querySelector("#sign-out");
const errorMessage = document.querySelector("#auth-error");
const datasetStatus = document.querySelector("#dataset-status");
const liftList = document.querySelector("#lift-list");
const loadMoreButton = document.querySelector("#load-more");
const pageSize = 50;
let loadedRows = 0;
let totalRows = 0;
let loadingRows = false;
let supabaseClient = null;
let activeUserId = null;

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("__SUPABASE_") &&
  SUPABASE_PUBLISHABLE_KEY.length > 20 &&
  !SUPABASE_PUBLISHABLE_KEY.includes("__SUPABASE_");

if (!configured) {
  showSignedOut();
  showError("Supabase has not been configured yet.");
  signInButton.disabled = true;
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      detectSessionInUrl: true,
      flowType: "pkce",
      persistSession: true,
    },
  });
  supabaseClient = supabase;

  signInButton.addEventListener("click", async () => {
    clearError();
    signInButton.disabled = true;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("./", window.location.href).href,
      },
    });

    if (error) {
      showError(error.message);
      signInButton.disabled = false;
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
    void loadLifts(supabase);
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
    resetLiftList();
    window.setTimeout(() => void loadLifts(supabaseClient), 0);
    return;
  }

  showSignedOut();
}

function showSignedOut() {
  activeUserId = null;
  loadingView.hidden = true;
  signedInView.hidden = true;
  signedOutView.hidden = false;
  signInButton.disabled = false;
  resetLiftList();
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.textContent = "";
  errorMessage.hidden = true;
}

async function loadLifts(supabase) {
  if (loadingRows || loadedRows >= totalRows && totalRows !== 0) return;

  loadingRows = true;
  loadMoreButton.disabled = true;
  datasetStatus.textContent = loadedRows === 0 ? "Loading your data…" : `${totalRows.toLocaleString()} imported exercise rows`;

  const { data, error, count } = await supabase
    .from("lift_entries")
    .select(
      "id, source_row, performed_on, gym, equipment_id, exercise, lift_sets(set_number, weight, reps)",
      { count: "exact" },
    )
    .order("performed_on", { ascending: false })
    .order("source_row", { ascending: false })
    .range(loadedRows, loadedRows + pageSize - 1);

  loadingRows = false;

  if (error) {
    datasetStatus.textContent = `Could not load your lifts: ${error.message}`;
    loadMoreButton.hidden = true;
    return;
  }

  totalRows = count ?? data.length;
  appendLiftRows(data);
  loadedRows += data.length;
  datasetStatus.textContent = `${totalRows.toLocaleString()} imported exercise rows`;
  loadMoreButton.hidden = loadedRows >= totalRows;
  loadMoreButton.disabled = false;
}

function appendLiftRows(rows) {
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const item = document.createElement("li");
    item.className = "lift-entry";

    const heading = document.createElement("h2");
    heading.textContent = row.exercise;

    const context = document.createElement("p");
    context.className = "lift-context";
    context.textContent = [formatDate(row.performed_on), row.gym, row.equipment_id]
      .filter(Boolean)
      .join(" · ");

    const sets = document.createElement("ul");
    sets.className = "set-list";

    for (const set of [...row.lift_sets].sort((a, b) => a.set_number - b.set_number)) {
      const setItem = document.createElement("li");
      const weight = set.weight === null ? "— kg" : `${Number(set.weight).toLocaleString()} kg`;
      const reps = set.reps === null ? "— reps" : `${set.reps} reps`;
      setItem.textContent = `Set ${set.set_number}: ${weight} × ${reps}`;
      sets.append(setItem);
    }

    item.append(heading, context, sets);
    fragment.append(item);
  }

  liftList.append(fragment);
}

function resetLiftList() {
  loadedRows = 0;
  totalRows = 0;
  loadingRows = false;
  liftList.replaceChildren();
  loadMoreButton.hidden = true;
  loadMoreButton.disabled = false;
  datasetStatus.textContent = "Loading your data…";
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(year, month - 1, day));
}
