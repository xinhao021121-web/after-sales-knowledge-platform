import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const resultRoot = path.join(root, "experiments", "results", "dify-cloud");
const outputPath = path.join(resultRoot, "artifact-hashes.json");
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (fullPath === outputPath || entry.name === "artifact-hashes.json") continue;
    if (!/\.(?:json|png|md|csv)$/.test(entry.name)) continue;
    files.push({
      path: path.relative(root, fullPath).replaceAll("\\", "/"),
      bytes: fs.statSync(fullPath).size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex")
    });
  }
}

walk(resultRoot);
files.sort((left, right) => left.path.localeCompare(right.path));
const manifest = {
  version: "1.0.0",
  generated_at: "2026-10-24",
  files
};
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`HASHES_WRITTEN=${outputPath} FILES=${files.length}`);
