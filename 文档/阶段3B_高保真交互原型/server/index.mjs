import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBffServer } from "../../阶段4B-1_BFF与P03真实RAG接入/server/start.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(here, "..");

await startBffServer({prototypeRoot});
