import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBffServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const updateEvidence = process.argv.includes("--update-evidence");
const requestKey = process.env.STAGE4B2_P10_IDEMPOTENCY_KEY ||
  "stage4b2a-r1-p10-all17-deepseek-v4-pro-negation-fix";
const config = loadConfig(prototypeRoot);
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
  if (!started.ok) {
    console.error(`FAILED: create evaluation code=${started.payload.error_code} status=${started.status}`);
    process.exitCode = 2;
  } else {
    let run = started.payload;
    const runStartedAt = Date.now();
    while (["QUEUED", "RUNNING"].includes(run.status) && Date.now() - runStartedAt < 900000) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const polled = await request(`/api/evaluations/${run.run_id}`, {
        headers: {"X-Demo-Role": "evaluation"}
      });
      if (!polled.ok) {
        console.error(`FAILED: poll code=${polled.payload.error_code} status=${polled.status}`);
        process.exitCode = 3;
        break;
      }
      run = polled.payload;
      console.log(`EVALUATION ${run.status} ${run.progress.completed}/${run.progress.total}`);
    }
    const runtimePath = path.join(config.runtimeRoot, "stage4b2a-p10-real.json");
    fs.mkdirSync(config.runtimeRoot, {recursive: true});
    fs.writeFileSync(runtimePath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    if (updateEvidence) {
      const evidenceRoot = path.join(projectRoot, "文档", "阶段4B-2A_P06真实入库与P10真实评测", "evidence");
      fs.mkdirSync(evidenceRoot, {recursive: true});
      fs.writeFileSync(path.join(evidenceRoot, "p10-real-evaluation.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
    }
    const terminal = ["PASSED", "FAILED", "BLOCKED", "COMPLETED_WITH_ERRORS"].includes(run.status);
    if (!terminal || run.results.length !== 17 || run.metrics?.p0_final_failures !== 0 || run.metrics?.citation_failures !== 0) {
      console.error(`FAILED: evaluation status=${run.status} tasks=${run.results.length} p0_failures=${run.metrics?.p0_final_failures} citation_failures=${run.metrics?.citation_failures}`);
      process.exitCode = 4;
    } else if (run.status !== "PASSED") {
      console.log(`COMPLETED_WITH_QUALITY_FAILURE: ${run.run_id} status=${run.status} tasks=${run.results.length} p0_failures=${run.metrics.p0_final_failures} cost=${run.metrics.cost.cost_status}`);
    } else {
      console.log(`PASSED: P10 real evaluation ${run.run_id} tasks=${run.results.length} cost=${run.metrics.cost.cost_status}`);
    }
  }
} finally {
  await new Promise(resolve => app.server.close(resolve));
}
