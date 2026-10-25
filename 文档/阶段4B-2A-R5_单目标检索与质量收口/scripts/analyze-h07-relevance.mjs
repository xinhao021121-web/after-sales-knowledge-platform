import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.resolve(
  here,
  "..",
  "evidence",
  "RET-H07-candidate-pool-before-fix.json"
);
const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const bigrams = value => {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[\s，。！？；：、,.!?;:“”"'（）()【】[\]|*\-]/g, "");
  const grams = new Set();
  for (let index = 0; index < text.length - 1; index++) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
};
const queryGrams = bigrams(data.query);
const documents = new Map();
for (const record of data.records) {
  const grams = documents.get(record.document_id) || new Set();
  for (const gram of bigrams(record.content)) grams.add(gram);
  documents.set(record.document_id, grams);
}
const documentFrequency = new Map();
for (const gram of queryGrams) {
  let count = 0;
  for (const grams of documents.values()) if (grams.has(gram)) count++;
  documentFrequency.set(gram, count);
}
const weight = gram => Math.log((documents.size + 1) / ((documentFrequency.get(gram) || 0) + 1)) + 1;
const totalWeight = [...queryGrams].reduce((total, gram) => total + weight(gram), 0);
const records = data.records.map(record => {
  const grams = bigrams(record.content);
  const matchedWeight = [...queryGrams]
    .filter(gram => grams.has(gram))
    .reduce((total, gram) => total + weight(gram), 0);
  return {
    position: record.position,
    score: record.score,
    document_id: record.document_id,
    document_name: record.document_name,
    segment_id: record.segment_id,
    lexical_relevance: totalWeight ? matchedWeight / totalWeight : 0,
    preview: record.content.slice(0, 140)
  };
}).sort((left, right) => right.lexical_relevance - left.lexical_relevance);
fs.writeFileSync(
  path.resolve(here, "..", "evidence", "RET-H07-relevance-analysis.json"),
  `${JSON.stringify({query: data.query, requested_top_k: 10, records}, null, 2)}\n`,
  "utf8"
);
console.log(records.map(record =>
  `${record.position} score=${record.score} relevance=${record.lexical_relevance.toFixed(3)} ${record.segment_id}`
).join("\n"));
