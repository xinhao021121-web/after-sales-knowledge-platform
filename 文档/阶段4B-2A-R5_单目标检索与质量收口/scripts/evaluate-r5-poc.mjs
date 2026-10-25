import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBusinessSemantics } from "../../阶段4B-1_BFF与P03真实RAG接入/server/semantic-evaluation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const inputName = process.argv[2] || "POC-R04-user-visible-final.json";
const spec = JSON.parse(fs.readFileSync(
  path.join(root, "regression", "poc-r04-visible-v1.0.json"),
  "utf8"
)).task;
const source = JSON.parse(fs.readFileSync(
  path.join(root, "evidence", inputName),
  "utf8"
));
const result = source.results?.length
  ? source.results.find(item => item.task_id === "POC-R04")
  : source.normalized
  ? {
      answer_status: source.normalized.answer_status,
      evidence: {
        answer: source.normalized.answer,
        suggested_action: source.normalized.suggested_action,
        retrieved: source.normalized.retrieval_resources,
        citation_support: source.normalized.citation_support
      },
      answer_goals: source.normalized.answer_goals,
      citations: source.normalized.citations,
      citation_support_passed: source.normalized.citation_support?.passed === true,
      provider_request_id: source.provider_request_id,
      bff_request_id: source.bff_request_id
    }
  : null;
if (!result) throw new Error("POC-R04 result missing");
const response = {
  answer_status: result.answer_status,
  answer: result.evidence?.answer || result.answer,
  suggested_action: result.evidence?.suggested_action || result.suggested_action,
  answer_goals: result.answer_goals || [],
  retrieval_resources: result.evidence?.retrieved || result.retrieval_resources || [],
  citations: result.citations || [],
  citation_support: {
    ...(result.evidence?.citation_support || result.citation_support),
    passed: result.citation_support_passed ?? result.citation_support?.passed
  },
  provider_called: result.provider_called,
  p0_passed: result.p0_passed
};
const semantics = evaluateBusinessSemantics(spec, response);
const output = {
  captured_at: new Date().toISOString(),
  source: `evidence/${inputName}`,
  run_id: source.run_id || null,
  task_id: "POC-R04",
  status: result.answer_status,
  answer: response.answer,
  suggested_action: response.suggested_action,
  citation_support_passed: response.citation_support.passed,
  provider_request_id: result.provider_request_id,
  bff_request_id: result.bff_request_id,
  resources: response.retrieval_resources,
  semantics,
  passed: semantics.passed
};
fs.writeFileSync(
  path.join(root, "evidence", "poc-r04-visible-semantic-r5.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8"
);
console.log(`POC-R04 semantic=${semantics.passed} status=${result.answer_status}`);
