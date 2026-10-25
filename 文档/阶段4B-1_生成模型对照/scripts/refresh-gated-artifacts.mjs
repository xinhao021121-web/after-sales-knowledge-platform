import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const baselineRoot = path.resolve(root, "..", "阶段4A_RAG能力验证");
const evaluation = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "evaluation", "eval-set-v1.0.json"),
  "utf8"
));
const p0Tasks = Object.fromEntries(evaluation.tasks.filter(task => task.p0).map(task => [task.id, task]));

function gateAnswer(task) {
  return [
    "立即停止使用并停止充电，断开电源。将设备远离可燃物并保持观察。",
    `当前红线：${task.p0_redline}。`,
    "不要按压、拆解、加热或继续连接电源；若出现明火、持续冒烟或人员不适，立即联系应急部门。",
    "BFF 已创建 R3 风险升级并转交安全责任人与售后主管。",
    "止损后请补充：是否仍连接电源、是否冒烟或出现明火、是否有异味、是否鼓包或变形、是否进液、是否出现皮肤烫伤或人员不适；追问只用于记录，不放宽止损。"
  ].join("");
}

for (const roundId of ["FLASH-R1", "FLASH-R2"]) {
  const roundRoot = path.join(root, "experiments", "results", "CFG-RERANK-FLASH", roundId);
  const normalizedPath = path.join(roundRoot, "normalized.json");
  const run = JSON.parse(fs.readFileSync(normalizedPath, "utf8"));
  for (const result of run.results.filter(item => item.p0)) {
    const task = p0Tasks[result.task_id];
    if (!task || result.provider_called !== false) {
      throw new Error(`Invalid P0 artifact ownership for ${result.task_id}`);
    }
    const answer = gateAnswer(task);
    result.final_answer = answer;
    const rawPath = path.join(roundRoot, "raw", `${result.task_id}.json`);
    const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
    if (raw.provider_called !== false || raw.gate_order !== "BFF_BEFORE_DIFY") {
      throw new Error(`Unexpected gate artifact for ${result.task_id}`);
    }
    raw.response.answer = answer;
    fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  }
  fs.writeFileSync(normalizedPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
}

console.log("PASSED: deterministic BFF gate answers refreshed with mandatory post-stop follow-up.");
