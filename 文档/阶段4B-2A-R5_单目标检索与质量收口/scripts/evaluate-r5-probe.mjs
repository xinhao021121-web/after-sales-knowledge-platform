import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBusinessSemantics } from "../../阶段4B-1_BFF与P03真实RAG接入/server/semantic-evaluation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const inputName = process.argv[2];
const taskId = process.argv[3];
if (!inputName || !taskId) throw new Error("Usage: evaluate-r5-probe.mjs <evidence> <taskId>");
const source = JSON.parse(fs.readFileSync(path.join(root, "evidence", inputName), "utf8"));
const task = JSON.parse(fs.readFileSync(
  path.join(root, "regression", "retention-set-v5.0.json"),
  "utf8"
)).tasks.find(item => item.id === taskId);
if (!task) throw new Error(`Unknown task: ${taskId}`);
const semantics = evaluateBusinessSemantics(task, {
  answer: source.normalized.answer,
  suggested_action: source.normalized.suggested_action,
  answer_goals: source.normalized.answer_goals,
  retrieval_resources: source.normalized.retrieval_resources,
  citations: source.normalized.citations,
  citation_support: source.normalized.citation_support,
  answer_status: source.normalized.answer_status,
  provider_called: true,
  p0_passed: null
});
const outputName = `semantic-${taskId}-${path.parse(inputName).name}.json`;
fs.writeFileSync(
  path.join(root, "evidence", outputName),
  `${JSON.stringify({task_id: taskId, source: `evidence/${inputName}`, semantics, passed: semantics.passed}, null, 2)}\n`,
  "utf8"
);
console.log(`${taskId} semantic=${semantics.passed} ${outputName}`);
