import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const stageRoot = path.resolve(here, "..");
const project1Root = path.resolve(stageRoot, "..", "..");
const docsRoot = path.join(project1Root, "文档");
const fixedSetPath = path.join(
  docsRoot,
  "阶段4B-2A_原型结项与质量风险冻结",
  "fixed-regression",
  "retention-set-frozen-final-1.0.0.json"
);
const r5Root = path.join(docsRoot, "阶段4B-2A-R5_单目标检索与质量收口");
const r5PromptPath = path.join(r5Root, "configs", "r5-system-prompt.txt");
const r5QualityPath = path.join(r5Root, "evidence", "quality-gate-r5.json");
const r5RunPath = path.join(r5Root, "evidence", "p10-real-r5.json");
const h09Path = path.join(r5Root, "evidence", "holdout", "RET-H09.json");

function sha256(filePath) {
  const content = fs.readFileSync(filePath);
  const textExtensions = new Set([".json", ".md", ".txt", ".mjs", ".js", ".ps1"]);
  const normalized = textExtensions.has(path.extname(filePath).toLowerCase())
    ? content.toString("utf8").replace(/\r\n/g, "\n")
    : content;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function copy(source, target) {
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(source, target);
}

const commit = execFileSync(
  "git",
  ["-C", path.dirname(project1Root), "rev-parse", "--short=7", "HEAD"],
  {encoding: "utf8"}
).trim();
const fixedSet = JSON.parse(fs.readFileSync(fixedSetPath, "utf8"));
if (fixedSet.tasks?.length !== 27 || fixedSet.status !== "FROZEN") {
  throw new Error("The 4B-2A fixed 27-task set is missing or not frozen");
}

copy(fixedSetPath, path.join(stageRoot, "baseline", "fixed-regression-used.json"));
copy(r5PromptPath, path.join(stageRoot, "configs", "r5-prompt-frozen.txt"));
copy(r5QualityPath, path.join(stageRoot, "baseline", "quality-gate-r5.json"));
copy(r5RunPath, path.join(stageRoot, "baseline", "p10-real-r5.json"));
copy(h09Path, path.join(stageRoot, "baseline", "ret-h09-first-failure.json"));

const lock = {
  lock_id: "4B2B-MODEL-ROUTING-INPUT-LOCK-1.0.0",
  captured_at: new Date().toISOString(),
  baseline_commit: commit,
  default_model: "deepseek-v4-pro",
  experiment_model: "deepseek-v4-flash",
  task_count: 27,
  suites: {
    FORMAL_17: fixedSet.tasks.filter(item => item.suite === "FORMAL_17").length,
    REGRESSION_8: fixedSet.tasks.filter(item => item.suite === "REGRESSION_8").length,
    HOLDOUT_2: fixedSet.tasks.filter(item => item.suite === "HOLDOUT_2").length
  },
  files: {
    fixed_regression: {
      source: path.relative(docsRoot, fixedSetPath).replaceAll("\\", "/"),
      frozen_copy: "baseline/fixed-regression-used.json",
      sha256: sha256(fixedSetPath)
    },
    prompt: {
      source: path.relative(docsRoot, r5PromptPath).replaceAll("\\", "/"),
      frozen_copy: "configs/r5-prompt-frozen.txt",
      sha256: sha256(r5PromptPath)
    },
    quality_gate_r5: {
      source: path.relative(docsRoot, r5QualityPath).replaceAll("\\", "/"),
      frozen_copy: "baseline/quality-gate-r5.json",
      sha256: sha256(r5QualityPath)
    },
    p10_r5: {
      source: path.relative(docsRoot, r5RunPath).replaceAll("\\", "/"),
      frozen_copy: "baseline/p10-real-r5.json",
      sha256: sha256(r5RunPath)
    },
    ret_h09_first_failure: {
      source: path.relative(docsRoot, h09Path).replaceAll("\\", "/"),
      frozen_copy: "baseline/ret-h09-first-failure.json",
      sha256: sha256(h09Path)
    }
  },
  unchanged_inputs: [
    "CANDIDATE dataset",
    "fixed 27 tasks and expected sources",
    "R5 system prompt",
    "BFF Top3 selection",
    "P0, permission, expiry, conflict, claim and provider-error gates"
  ],
  prohibited_changes: [
    "change tasks or expected evidence",
    "change prompt or retrieval",
    "fix RET-H09",
    "make Flash the default without explicit experiment mode"
  ]
};
fs.mkdirSync(path.join(stageRoot, "baseline"), {recursive: true});
fs.writeFileSync(
  path.join(stageRoot, "baseline", "input-lock.json"),
  `${JSON.stringify(lock, null, 2)}\n`,
  "utf8"
);
console.log(JSON.stringify(lock, null, 2));
