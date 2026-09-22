import {
  exposeAPI
} from "./chunk-7GUL3OBQ.js";

// src/cubing/search/worker-workarounds/search-worker-entry.js
if (exposeAPI.expose) {
  void import("./inside-2UHCW2TB.js").then(() => {
    if (globalThis.postMessage) {
      globalThis.postMessage("comlink-exposed");
    } else {
      globalThis.process.getBuiltinModule("node:worker_threads").parentPort?.postMessage("comlink-exposed");
    }
  });
}
var WORKER_ENTRY_FILE_URL = import.meta.url;
export {
  WORKER_ENTRY_FILE_URL
};
//# sourceMappingURL=search-worker-entry.js.map
