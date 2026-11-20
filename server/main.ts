// Must stay first: db.ts opens and migrates cockpit.db as soon as it is imported.
import "./dataDirLock.ts";
import { db, failInterruptedMutations, prIsOpen, startCacheRetention } from "./db.ts";
import { kickWorker, recoverRefreshingMutations } from "./mutations.ts";
import { seedSettings } from "./settings.ts";
import { startPoller } from "./poller.ts";
import { githubOnlyFetch } from "./githubNetwork.ts";
import { buildFetchHandler } from "./http.ts";
import { installMockNetworkGuard, isMockGithub, seedMockDatabase } from "./mockGithub.ts";
import { startCockpitServer } from "./cockpitServer.ts";
import { startPrWorktreePruning } from "./mirror.ts";
import { conflictingSupervisor } from "./supervisor.ts";

const port = Number(Bun.env.COCKPIT_PORT ?? 4820);
const supervisorConflict = conflictingSupervisor(port);
if (supervisorConflict) {
  console.log(`pr-cockpit: ${supervisorConflict} owns port ${port}; unmanaged server will not start`);
  process.exit(0);
}

try {
  // Subprocesses that read GitHub must not silently route through an ambient HTTP proxy.
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) delete process.env[key];
  globalThis.fetch = githubOnlyFetch(globalThis.fetch);
  installMockNetworkGuard();
  seedSettings();
  if (isMockGithub) {
    if (!Bun.env.COCKPIT_DATA_DIR) throw new Error("COCKPIT_MOCK requires an explicit COCKPIT_DATA_DIR");
    seedMockDatabase(db, Bun.env.COCKPIT_DATA_DIR);
  } else {
    failInterruptedMutations();
    await recoverRefreshingMutations();
    kickWorker();
  }

  startCockpitServer(port, buildFetchHandler(port));

  if (!isMockGithub) {
    startPoller();
    startPrWorktreePruning(prIsOpen);
    startCacheRetention();
  }
  console.log(`pr-cockpit server listening on http://127.0.0.1:${port} (pid ${process.pid})`);
} catch (err) {
  console.error(`pr-cockpit server failed to start on http://127.0.0.1:${port} (pid ${process.pid}):`, err);
  process.exit(1);
}
