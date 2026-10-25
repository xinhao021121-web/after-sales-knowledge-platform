import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBffServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const recoveryRoot = path.join(projectRoot, "文档", "阶段4B-2A-R4_单题回归修复");
const requestKey = process.env.STAGE4B2_R4_IDEMPOTENCY_KEY ||
  `stage4b2a-r4-p10-all17-${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
const config = loadConfig(prototypeRoot, {RAG_REQUEST_TIMEOUT_MS: "90000"});
const app = createBffServer({prototypeRoot, config});

await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const payload = await response.json();
  return {ok: response.ok, status: response.status, payload};
}

try {
  const started = await request("/api/evaluations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": requestKey,
      "X-Demo-Role": "evaluation"
    },
    body: JSON.stringify({task_scope: "ALL_17", model: config.generationModel})
  });
  if (!started.ok) throw new Error(`Create evaluation failed: ${started.status} ${JSON.stringify(started.payload)}`);
  let run = started.payload;
  const startedAt = Date.now();
  while (["QUEUED", "RUNNING"].includes(run.status) && Date.now() - startedAt < 900000) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const polled = await request(`/api/evaluations/${run.run_id}`, {
      headers: {"X-Demo-Role": "evaluation"}
    });
    if (!polled.ok) throw new Error(`Poll failed: ${polled.status} ${JSON.stringify(polled.payload)}`);
    run = polled.payload;
    console.log(`EVALUATION ${run.status} ${run.progress.completed}/${run.progress.total}`);
  }
  fs.mkdirSync(config.runtimeRoot, {recursive: true});
  fs.writeFileSync(
    path.join(config.runtimeRoot, "stage4b2a-r4-p10-real.json"),
    `${JSON.stringify(run, null, 2)}\n`,
    "utf8"
  );
  const evidenceRoot = path.join(recoveryRoot, "evidence", "formal-17");
  fs.mkdirSync(evidenceRoot, {recursive: true});
  fs.writeFileSync(
    path.join(recoveryRoot, "evidence", "p10-real-r4.json"),
    `${JSON.stringify(run, null, 2)}\n`,
    "utf8"
  );
  for (const result of run.results || []) {
    fs.writeFileSync(
      path.join(evidenceRoot, `${result.task_id}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8"
    );
  }
  if (!["PASSED", "FAILED", "BLOCKED", "COMPLETED_WITH_ERRORS"].includes(run.status) || run.results.length !== 17) {
    throw new Error(`Evaluation incomplete: status=${run.status} tasks=${run.results.length}`);
  }
  console.log(`RESULT: ${run.run_id} status=${run.status} recall=${run.metrics.recall_at_3_core} ` +
    `sources=${run.metrics.retrieval_covered_source_count}/${run.metrics.retrieval_expected_source_count} ` +
    `answered=${run.metrics.cost.model_effective_answer_count} errors=${run.metrics.provider_errors}`);
} finally {
  await new Promise(resolve => app.server.close(resolve));
}
