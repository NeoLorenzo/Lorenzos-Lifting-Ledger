import assert from "node:assert/strict";
import test from "node:test";

test("intentional CI Node failure probe", () => {
  assert.fail("intentional Node validation probe for issue #34");
});
