import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRuntimeConfig, loadConfig } from "./config.mjs";
import { createBffServer } from "./app.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultPrototypeRoot = path.resolve(here, "..", "..", "阶段3B_高保真交互原型");

export async function startBffServer({prototypeRoot = defaultPrototypeRoot} = {}) {
  const config = loadConfig(prototypeRoot);
  assertRuntimeConfig(config);
  const app = createBffServer({prototypeRoot, config});
  await new Promise((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(config.port, config.host, resolve);
  });
  console.log(`BFF_READY=http://${config.host}:${config.port}`);
  console.log(`PROTOTYPE_URL=http://${config.host}:${config.port}/index.html#P03`);
  console.log(`DIFY_MODEL=${config.generationModel}`);
  return app;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const app = await startBffServer();
  const shutdown = () => app.server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
