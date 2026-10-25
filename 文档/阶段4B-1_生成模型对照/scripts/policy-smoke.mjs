import assert from "node:assert/strict";
import { applyCitationGate, resolveCitationMarker } from "./lib/citation-policy.mjs";

assert.equal(resolveCitationMarker("1", [{content: "one"}]), true);
assert.equal(resolveCitationMarker("2", [{content: "one"}]), false);
assert.equal(resolveCitationMarker("CHUNK-SAFE-01", [{content: "CHUNK-SAFE-01 止损"}]), true);

assert.deepEqual(
  applyCitationGate({citationRequired: true, citationTraceable: false, answerStatus: "ANSWERED"}),
  {answerStatus: "NEEDS_CLARIFICATION", forcedDowngrade: true}
);
assert.deepEqual(
  applyCitationGate({citationRequired: true, citationTraceable: true, answerStatus: "ANSWERED"}),
  {answerStatus: "ANSWERED", forcedDowngrade: false}
);
assert.deepEqual(
  applyCitationGate({citationRequired: false, citationTraceable: false, answerStatus: "NO_ANSWER"}),
  {answerStatus: "NO_ANSWER", forcedDowngrade: false}
);

console.log("PASSED: citation traceability and missing-citation downgrade policy.");
