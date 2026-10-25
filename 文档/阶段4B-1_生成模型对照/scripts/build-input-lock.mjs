import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const baselineRoot = path.join(projectRoot, "文档", "阶段4A_RAG能力验证");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function record(absolutePath, category) {
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing locked input: ${absolutePath}`);
  return {
    category,
    path: path.relative(root, absolutePath).replaceAll("\\", "/"),
    sha256: sha256(absolutePath),
    bytes: fs.statSync(absolutePath).size
  };
}

const files = [
  record(path.join(baselineRoot, "evaluation", "eval-set-v1.0.json"), "evaluation_set"),
  record(path.join(baselineRoot, "datasets", "CANDIDATE", "manifest.json"), "candidate_manifest"),
  record(path.join(baselineRoot, "datasets", "TEST", "manifest.json"), "test_manifest"),
  record(path.join(baselineRoot, "experiments", "results", "dify-cloud", "comparison.json"), "pro_formal_comparison"),
  record(path.join(baselineRoot, "experiments", "manual-review.json"), "pro_manual_review")
];

for (const dataset of ["CANDIDATE", "TEST"]) {
  const manifest = JSON.parse(fs.readFileSync(path.join(baselineRoot, "datasets", dataset, "manifest.json"), "utf8"));
  for (const document of manifest.documents) {
    files.push(record(path.join(baselineRoot, "datasets", dataset, document.file), `${dataset.toLowerCase()}_document`));
  }
}

const proRawRoot = path.join(baselineRoot, "experiments", "results", "dify-cloud", "CFG-RERANK");
for (const taskFile of fs.readdirSync(path.join(proRawRoot, "raw")).filter(name => name.endsWith(".json")).sort()) {
  files.push(record(path.join(proRawRoot, "raw", taskFile), "pro_raw_response"));
}
files.push(record(path.join(proRawRoot, "summary.json"), "pro_summary"));

const output = {
  lock_id: "INPUT-PRO-LOCK-4B1-1.0.0",
  created_at: new Date().toISOString(),
  canonical_evaluation_set: "EVAL-RAG-POC-1.0.0",
  notice: "输入与 Pro 基线只读锁定；路径相对本阶段目录，原始文件仍位于阶段4A。",
  files
};
const outputPath = path.join(root, "experiments", "input-and-baseline-lock.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`LOCKED_FILES=${files.length}`);
console.log(`WROTE=${outputPath}`);
