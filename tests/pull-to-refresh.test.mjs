import assert from "node:assert/strict";
import test from "node:test";
import { createPullToRefresh, isInteractiveTouchTarget, PULL_TO_REFRESH_THRESHOLD } from "../features/pull-to-refresh.js";

function createHarness({ scrollY = 0, interactive = false } = {}) {
  let reloads = 0;
  const indicator = {
    hidden: true,
    textContent: "",
    style: { setProperty() {} },
    classList: { toggle() {} },
  };
  const win = { scrollY, addEventListener() {}, removeEventListener() {} };
  const interaction = createPullToRefresh({ window: win, document: {}, indicator, reload: () => { reloads += 1; } });
  const target = { closest: () => interactive ? {} : null };
  const touch = (x, y) => ({ clientX: x, clientY: y });
  return {
    interaction, indicator, target, touch, get reloads() { return reloads; },
    start(x = 0, y = 0, touches = [touch(x, y)]) { interaction.onTouchStart({ target, touches }); },
    move(x = 0, y = 0, touches = [touch(x, y)]) {
      let prevented = false;
      interaction.onTouchMove({ target, touches, cancelable: true, preventDefault: () => { prevented = true; } });
      return prevented;
    },
  };
}

test("top pull above threshold reloads exactly once on release", () => {
  const h = createHarness();
  h.start();
  assert.equal(h.move(0, PULL_TO_REFRESH_THRESHOLD + 1), true);
  h.interaction.onTouchEnd();
  h.interaction.onTouchEnd();
  assert.equal(h.reloads, 1);
});

test("a gesture beginning with two touches never activates or reloads", () => {
  const h = createHarness();
  h.start(0, 0, [h.touch(0, 0), h.touch(20, 0)]);
  h.move(0, 100, [h.touch(0, 100), h.touch(20, 100)]);
  h.interaction.onTouchEnd({ touches: [h.touch(20, 100)] });
  assert.equal(h.reloads, 0);
  assert.deepEqual(h.interaction.getState(), { active: false, distance: 0, reloaded: false });
});

test("a single-touch pull that gains a second touch is cancelled", () => {
  const h = createHarness();
  h.start();
  h.move(0, 100);
  h.move(0, 100, [h.touch(0, 100), h.touch(20, 100)]);
  h.interaction.onTouchEnd({ touches: [] });
  assert.equal(h.reloads, 0);
  assert.equal(h.indicator.hidden, true);
});

test("lifting one finger from a multi-touch sequence cannot refresh", () => {
  const h = createHarness();
  h.start();
  h.move(0, 100);
  h.interaction.onTouchEnd({ touches: [h.touch(20, 100)] });
  assert.equal(h.reloads, 0);
});

test("below-threshold pull cancels without reload", () => {
  const h = createHarness(); h.start(); h.move(0, PULL_TO_REFRESH_THRESHOLD - 1); h.interaction.onTouchEnd();
  assert.equal(h.reloads, 0);
  assert.equal(h.indicator.hidden, true);
});

test("a gesture that starts below the document top is ignored", () => {
  const h = createHarness({ scrollY: 1 }); h.start(); h.move(0, 100); h.interaction.onTouchEnd();
  assert.equal(h.reloads, 0);
});

test("interactive targets and descendants are ignored", () => {
  const h = createHarness({ interactive: true }); h.start(); h.move(0, 100); h.interaction.onTouchEnd();
  assert.equal(h.reloads, 0);
  assert.equal(isInteractiveTouchTarget({ closest: () => ({}) }), true);
});

test("touch cancellation resets without reload", () => {
  const h = createHarness(); h.start(); h.move(0, 100); h.interaction.onTouchCancel(); h.interaction.onTouchEnd();
  assert.equal(h.reloads, 0);
  assert.deepEqual(h.interaction.getState(), { active: false, distance: 0, reloaded: false });
});

test("moving back below the threshold prevents refresh", () => {
  const h = createHarness(); h.start(); h.move(0, 100); h.move(0, 30); h.interaction.onTouchEnd();
  assert.equal(h.reloads, 0);
  assert.equal(h.indicator.textContent, "Pull to refresh");
});

test("horizontal gestures reset without preventing native scrolling", () => {
  const h = createHarness(); h.start();
  assert.equal(h.move(30, 10), false);
  h.interaction.onTouchEnd();
  assert.equal(h.reloads, 0);
});

test("ordinary navigation has no refresh side effect", () => {
  const h = createHarness();
  h.interaction.onTouchEnd();
  assert.equal(h.reloads, 0);
});
