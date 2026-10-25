import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const baselineRoot = path.join(projectRoot, "文档", "阶段4A_RAG能力验证");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const manifest = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "datasets", "CANDIDATE", "manifest.json"),
  "utf8"
));
const testManifest = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "datasets", "TEST", "manifest.json"),
  "utf8"
));

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') {
      value += '"';
      index++;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value);
  return cells;
}

const csvLines = fs.readFileSync(
  path.join(baselineRoot, "sources", "source-records-2026-10-24.csv"),
  "utf8"
).split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(csvLines[0]);
const sources = Object.fromEntries(csvLines.slice(1).map(line => {
  const values = parseCsvLine(line);
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  return [row.src_id, row];
}));

function documentEntry(document, dataset) {
  const primarySource = sources[document.src_ids[0]] || {};
  const fileName = path.basename(document.file);
  return {
    kb_id: `KB-${document.doc_id}`,
    doc_id: document.doc_id,
    file_name: fileName,
    title: document.title,
    version: document.version,
    src_id: document.src_ids[0],
    src_ids: document.src_ids,
    url: primarySource.url_or_file || null,
    publisher: document.publisher,
    verified_at: document.verified_at,
    valid_until: document.valid_until,
    scope: document.scope,
    owner_role: document.owner_role,
    authority: document.authority,
    status: document.status,
    permission_scope: document.permission_scope,
    dataset
  };
}

const catalog = {
  catalog_id: "DEMO-RAG-CATALOG-4B1-1.0.0",
  generated_at: "2026-10-24",
  notice: "公开资料驱动的模拟企业来源目录，不包含真实客户或订单数据。",
  documents: [
    ...manifest.documents.map(document => documentEntry(document, "CANDIDATE")),
    ...testManifest.documents.map(document => documentEntry(document, "TEST"))
  ],
  safety_chunk: {
    kb_id: "KB-DOC-SAFETY-V1",
    doc_id: "DOC-SAFETY-V1",
    file_name: "02_安全SOP.md",
    src_id: "SRC-PUB-002",
    version: "1.0.0",
    title: "AirPods Pro 3 安全处置 SOP",
    url: "https://support.apple.com/zh-cn/guide/airpods/dev4744b22af/web",
    publisher: "项目模拟法务安全责任组",
    verified_at: "2026-10-24",
    valid_until: "2026-12-31",
    status: "active",
    permission_scope: "public_customer_service",
    chunk_id: "CHUNK-SAFE-STOP-01",
    text: "疑似过热、鼓包或液体进入时，立即停止使用和充电，拔除外部电源；不要按压、弯折、拆机、穿刺或继续充电。将产品放在远离可燃物的通风处并保持观察。若出现明火、持续冒烟或爆裂声，人员先撤离并联系当地应急部门。"
  }
};

const outputPath = path.join(prototypeRoot, "data", "catalog.json");
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`WROTE=${outputPath}`);
