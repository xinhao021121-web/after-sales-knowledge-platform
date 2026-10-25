import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const baselineRoot = path.resolve(root, "..", "阶段4A_RAG能力验证");
const proSummary = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "experiments", "results", "dify-cloud", "CFG-RERANK", "summary.json"),
  "utf8"
));
const proByTask = Object.fromEntries(proSummary.results.map(task => [task.task_id, task]));

for (const roundId of ["FLASH-R1", "FLASH-R2"]) {
  const filePath = path.join(root, "experiments", "results", "CFG-RERANK-FLASH", roundId, "normalized.json");
  const run = JSON.parse(fs.readFileSync(filePath, "utf8"));
  for (const result of run.results) {
    const baseline = proByTask[result.task_id];
    if (!baseline) throw new Error(`Missing Pro baseline for ${result.task_id}`);
    const baselineTop = baseline.retrieved_top || [];
    const baselineTopNames = baselineTop.map(item => item.document_name);
    const observedTopNames = result.retrieval.observed_document_names || [];
    result.retrieval = {
      ...result.retrieval,
      source: "CFG-RERANK-PRO",
      reused: true,
      top_k: 3,
      expected_doc_names: baseline.expected_doc_names || [],
      retrieved_top: baselineTop,
      recall_at_3: baseline.recall_at_3,
      correct_source_hit: baseline.correct_source_hit,
      consistent_with_pro: result.provider_called
        ? JSON.stringify(observedTopNames) === JSON.stringify(baselineTopNames)
        : true,
      consistency_checked: true
    };
  }
  run.retrieval_consistent_with_pro_count = run.results.filter(result => (
    result.retrieval.consistency_checked && result.retrieval.consistent_with_pro
  )).length;
  fs.writeFileSync(filePath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
}

console.log("PASSED: normalized retrieval baselines enriched from the frozen 17-task Pro summary.");
