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
const requestKey = process.env.STAGE4B2_P06_IDEMPOTENCY_KEY ||
  "stage4b2a-r1-p06-DOC-FAQ-V1-canonical-700-100";
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
  const health = await request("/api/dataset/health", {
    headers: {"X-Demo-Role": "knowledge"}
  });
  if (!health.ok) {
    console.error(`BLOCKED: Dataset API health=${health.status} code=${health.payload.error_code}`);
    process.exitCode = 2;
  } else {
    const start = await request("/api/ingestions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestKey,
        "X-Demo-Role": "knowledge"
      },
      body: JSON.stringify({
        doc_id: "DOC-FAQ-V1",
        src_id: "SRC-PUB-001",
        source_version: "1.0.0"
      })
    });
    if (!start.ok) {
      console.error(`FAILED: upload code=${start.payload.error_code} status=${start.status}`);
      process.exitCode = 3;
    } else {
      let job = start.payload;
      const startedAt = Date.now();
      while (!["DOCUMENT_READY", "DOCUMENT_FAILED"].includes(job.document_status) && Date.now() - startedAt < 180000) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const polled = await request(`/api/ingestions/${job.ingestion_id}`, {
          headers: {"X-Demo-Role": "knowledge"}
        });
        if (!polled.ok) {
          console.error(`FAILED: poll code=${polled.payload.error_code} status=${polled.status}`);
          process.exitCode = 4;
          break;
        }
        job = polled.payload;
        console.log(`INGESTION ${job.document_status} ${job.provider_status} ${job.completed_segments}/${job.total_segments}`);
      }
      const healthAfter = await request("/api/dataset/health", {
        headers: {"X-Demo-Role": "knowledge"}
      });
      const evidence = {
        provider: "Dify Dataset API",
        checked_at: new Date().toISOString(),
        dataset_health: health.payload,
        dataset_health_after: healthAfter.payload,
        ingestion: job
      };
      const runtimePath = path.join(config.runtimeRoot, "stage4b2a-p06-real.json");
      fs.mkdirSync(config.runtimeRoot, {recursive: true});
      fs.writeFileSync(runtimePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
      if (updateEvidence) {
        const evidenceRoot = path.join(projectRoot, "文档", "阶段4B-2A_P06真实入库与P10真实评测", "evidence");
        fs.mkdirSync(evidenceRoot, {recursive: true});
        fs.writeFileSync(path.join(evidenceRoot, "p06-real-ingestion.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
      }
      if (job.document_status !== "DOCUMENT_READY" || job.publishable !== true) {
        console.error(`FAILED: indexing ended in ${job.document_status}/${job.provider_status}`);
        process.exitCode = 5;
      } else {
        console.log(`PASSED: P06 real ingestion ${job.ingestion_id} provider_document_id=${job.provider_document_id}`);
      }
    }
  }
} finally {
  await new Promise(resolve => app.server.close(resolve));
}
