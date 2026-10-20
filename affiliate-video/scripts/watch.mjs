// Queue worker. Picks requests from requests/inbox one at a time (renders are CPU-bound).
//   npm run watch            keep polling
//   npm run watch -- --once  drain the inbox and exit (for schedulers)
// Outcomes: requests/done, requests/failed, or requests/waiting (product needs a signed-in Shopee extraction).
import fs from "node:fs";
import path from "node:path";
import { REQUESTS, ledger, log, readJson, writeJson } from "./lib.mjs";
import { NeedsExtraction, runRequest } from "./run.mjs";

const dirs = Object.fromEntries(["inbox", "done", "failed", "waiting"].map((d) => [d, path.join(REQUESTS, d)]));
Object.values(dirs).forEach((d) => fs.mkdirSync(d, { recursive: true }));
const once = process.argv.includes("--once");

function move(file, to, extra) {
  const req = readJson(file);
  writeJson(path.join(dirs[to], path.basename(file)), { ...req, ...extra, finishedAt: new Date().toISOString() });
  fs.rmSync(file);
}

async function tick() {
  // waiting requests get retried: the extraction may have happened since
  for (const f of fs.readdirSync(dirs.waiting)) {
    const p = path.join(dirs.waiting, f);
    if (once || Date.now() - fs.statSync(p).mtimeMs > 5 * 60_000) fs.renameSync(p, path.join(dirs.inbox, f));
  }
  const files = fs.readdirSync(dirs.inbox).filter((f) => f.endsWith(".json")).sort();
  for (const f of files) {
    const file = path.join(dirs.inbox, f);
    log(`processing ${f}`);
    try {
      const result = await runRequest(readJson(file));
      move(file, "done", { result });
      ledger("jobs", { request: f, ok: true, result });
    } catch (e) {
      if (e instanceof NeedsExtraction) {
        log(`${f}: ${e.message} -> waiting (run the Shopee extraction, see README)`);
        move(file, "waiting", { waitingFor: "shopee_extraction" });
      } else {
        log(`${f}: FAILED ${e.stack || e}`);
        move(file, "failed", { error: String(e.message || e) });
        ledger("jobs", { request: f, ok: false, error: String(e.message || e) });
      }
    }
  }
  return files.length;
}

if (once) {
  await tick();
  process.exit(0);
}
log("watching requests/inbox (Ctrl+C to stop)");
for (;;) {
  const n = await tick();
  await new Promise((r) => setTimeout(r, n ? 1000 : 15000));
}
