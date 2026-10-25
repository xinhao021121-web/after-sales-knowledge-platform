import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBusinessSemantics } from "../../阶段4B-1_BFF与P03真实RAG接入/server/semantic-evaluation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const spec = JSON.parse(fs.readFileSync(
  path.join(root, "regression", "poc-r04-visible-v1.0.json"),
  "utf8"
)).task;
const run = JSON.parse(fs.readFileSync(
  path.join(root, "evidence", "p10-real-r4.json"),
  "utf8"
));
const result = run.results.find(item => item.task_id === "POC-R04");
if (!result) throw new Error("POC-R04 result missing");
const response = {
  answer_status: result.answer_status,
  answer: result.evidence.answer,
  suggested_action: result.evidence.suggested_action,
  answer_goals: result.answer_goals || [],
  retrieval_resources: result.evidence.retrieved || [],
  citations: result.citations || [],
  citation_support: {
    ...result.evidence.citation_support,
    passed: result.citation_support_passed
  },
  provider_called: result.provider_called,
  p0_passed: result.p0_passed
};
const semantics = evaluateBusinessSemantics(spec, response);
const output = {
  captured_at: new Date().toISOString(),
  run_id: run.run_id,
  task_id: "POC-R04",
  status: result.answer_status,
  answer: response.answer,
  suggested_action: response.suggested_action,
  citation_support_passed: result.citation_support_passed,
  provider_request_id: result.provider_request_id,
  bff_request_id: result.bff_request_id,
  resources: result.evidence.retrieved,
  semantics,
  passed: semantics.passed
};
fs.writeFileSync(
  path.join(root, "evidence", "poc-r04-visible-semantic.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8"
);
console.log(`POC-R04 semantic=${semantics.passed} status=${result.answer_status}`);
