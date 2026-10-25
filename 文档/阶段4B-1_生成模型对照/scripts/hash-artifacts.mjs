import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outputPath = path.join(root, "experiments", "artifact-hashes.json");
const extensions = new Set([".md", ".json", ".mjs", ".ps1"]);
const files = [];

for (const entry of fs.readdirSync(root, {recursive: true, withFileTypes: true})) {
  if (!entry.isFile()) continue;
  const fullPath = path.join(entry.parentPath, entry.name);
  if (fullPath === outputPath || !extensions.has(path.extname(entry.name))) continue;
  const relative = path.relative(root, fullPath).replaceAll("\\", "/");
  files.push({
    path: relative,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex"),
    bytes: fs.statSync(fullPath).size
  });
}

files.sort((a, b) => a.path.localeCompare(b.path));
const output = {
  manifest_id: "STAGE4B1-ARTIFACT-HASHES-1.0.0",
  created_at: new Date().toISOString(),
  file_count: files.length,
  files
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`HASHED_FILES=${files.length}`);
console.log(`WROTE=${outputPath}`);
