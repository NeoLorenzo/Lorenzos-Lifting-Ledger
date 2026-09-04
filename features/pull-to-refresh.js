const INTERACTIVE_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a",
  "label",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='checkbox']",
  "[role='link']",
  "[role='menuitem']",
  "[role='option']",
  "[role='slider']",
  "[role='switch']",
  "[role='tab']",
].join(", ");

export const PULL_TO_REFRESH_THRESHOLD = 80;

export function isInteractiveTouchTarget(target) {
  return Boolean(target && typeof target.closest === "function" && target.closest(INTERACTIVE_TARGET_SELECTOR));
}

function getTouch(event) {
  return event.touches?.[0] || event.changedTouches?.[0] || null;
}

export function createPullToRefresh(options = {}) {
  const win = options.window || window;
  const doc = options.document || document;
  const threshold = options.threshold || PULL_TO_REFRESH_THRESHOLD;
  const reload = options.reload || (() => win.location.reload());
  const indicator = options.indicator || createIndicator(doc);
  let active = false;
  let startX = 0;
  let startY = 0;
  let distance = 0;
  let reloaded = false;

  function render() {
    if (!indicator) return;
    const progress = Math.min(distance / threshold, 1);
    indicator.hidden = !active || distance <= 0;
    indicator.style.setProperty("--pull-progress", String(progress));
    indicator.classList.toggle("is-ready", distance >= threshold);
    indicator.textContent = distance >= threshold ? "Release to refresh" : "Pull to refresh";
  }

  function reset() {
    active = false;
    distance = 0;
    render();
  }

  function onTouchStart(event) {
    const touch = getTouch(event);
    if (event.touches?.length !== 1) {
      reset();
      return;
    }
    if (!touch || win.scrollY > 0 || isInteractiveTouchTarget(event.target)) return;
    active = true;
    startX = touch.clientX;
    startY = touch.clientY;
    distance = 0;
    render();
  }

  function onTouchMove(event) {
    if (!active) return;
    if (event.touches?.length !== 1) return reset();
    const touch = getTouch(event);
    if (!touch) return reset();
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY)) return reset();
    if (deltaY <= 0) return reset();
    distance = deltaY;
    render();
    if (event.cancelable) event.preventDefault();
  }

  function onTouchEnd(event = {}) {
    const isFinalTouchEnd = event.touches === undefined || event.touches.length === 0;
    const shouldReload = active && isFinalTouchEnd && distance >= threshold && !reloaded;
    reset();
    if (!shouldReload) return;
    reloaded = true;
    reload();
  }

  function onTouchCancel() {
    reset();
  }

  function attach() {
    win.addEventListener("touchstart", onTouchStart, { passive: true });
    win.addEventListener("touchmove", onTouchMove, { passive: false });
    win.addEventListener("touchend", onTouchEnd, { passive: true });
    win.addEventListener("touchcancel", onTouchCancel, { passive: true });
  }

  function destroy() {
    win.removeEventListener("touchstart", onTouchStart);
    win.removeEventListener("touchmove", onTouchMove);
    win.removeEventListener("touchend", onTouchEnd);
    win.removeEventListener("touchcancel", onTouchCancel);
    indicator?.remove();
  }

  return { attach, destroy, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, getState: () => ({ active, distance, reloaded }) };
}

function createIndicator(doc) {
  if (!doc?.createElement || !doc.body) return null;
  const indicator = doc.createElement("div");
  indicator.className = "pull-to-refresh-indicator";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  indicator.hidden = true;
  doc.body.prepend(indicator);
  return indicator;
}

export function initializePullToRefresh() {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const interaction = createPullToRefresh();
  interaction.attach();
  return interaction;
}
