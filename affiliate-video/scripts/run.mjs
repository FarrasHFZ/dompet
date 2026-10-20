// Process one request end to end:
// product (ingested) -> recipe pick -> storyboards (guarded) -> voiceover -> render -> QC -> poster -> registry -> review page.
//   npm run run-request -- requests/inbox/<id>.json
import fs from "node:fs";
import path from "node:path";
import { Request } from "../src/schema.js";
import { ingest } from "./ingest.mjs";
import { JOBS, OUT, PRODUCTS, ledger, loadProduct, loadRecipes, log, readJson, writeJson } from "./lib.mjs";
import { pickRecipes } from "./perf.mjs";
import { poster, qc, renderStoryboard } from "./render.mjs";
import { buildReview, setVideo } from "./registry.mjs";
import { voiceStoryboard } from "./voice.mjs";
import { writeStoryboards } from "./writer.mjs";

export class NeedsExtraction extends Error {}

function findProduct(req) {
  if (req.productId && fs.existsSync(path.join(PRODUCTS, req.productId, "product.json"))) return loadProduct(req.productId);
  const itemId = req.productUrl?.match(/i\.\d+\.(\d+)/)?.[1] ?? req.productUrl?.match(/product\/\d+\/(\d+)/)?.[1];
  if (itemId && fs.existsSync(PRODUCTS)) {
    for (const d of fs.readdirSync(PRODUCTS)) {
      const p = path.join(PRODUCTS, d, "product.json");
      if (fs.existsSync(p) && readJson(p).itemId === itemId) return readJson(p);
    }
  }
  return null;
}

export async function runRequest(raw) {
  const req = Request.parse(raw);
  let product = findProduct(req);
  if (!product && req.extractFile) product = await ingest(readJson(req.extractFile), { affiliateUrl: req.affiliateUrl });
  if (!product) throw new NeedsExtraction(`product not ingested yet: ${req.productUrl || req.productId}`);
  if (!product.claims.length) throw new Error(`${product.id} has no verified claims; nothing truthful to say`);

  const all = loadRecipes();
  const recipes = req.recipes.length
    ? req.recipes.map((id) => all.find((r) => r.id === id) ?? (() => { throw new Error(`unknown recipe ${id}`); })())
    : pickRecipes(product, all, req.experiment === "recipe" ? req.variants : 1);
  log(`${req.id}: ${product.id} x ${recipes.map((r) => r.id).join(", ")} (${req.experiment} test, ${req.variants} variants)`);

  const jobId = `${req.id}`;
  const jobDir = path.join(OUT, jobId);
  const boards = await writeStoryboards({ product, recipes, request: req });
  const results = [];
  for (const { storyboard: sb, problems } of boards) {
    const recipe = recipes.find((r) => r.id === sb.recipeId);
    const base = { id: sb.id, jobId, requestId: req.id, productId: product.id, recipeId: sb.recipeId, variant: sb.variant, experiment: sb.experiment, title: sb.title, caption: sb.caption };
    if (problems.length) {
      log(`${sb.id}: blocked by guard -> ${problems.join(" | ")}`);
      writeJson(path.join(jobDir, `${sb.variant}.storyboard.json`), sb);
      setVideo({ ...base, status: "blocked", guard: problems });
      results.push({ id: sb.id, status: "blocked" });
      continue;
    }
    await voiceStoryboard(sb, recipe, path.join(JOBS, jobId, sb.variant));
    writeJson(path.join(jobDir, `${sb.variant}.storyboard.json`), sb);
    const file = path.join(jobDir, `${sb.variant}.mp4`);
    const t0 = Date.now();
    await renderStoryboard(sb, product, file);
    const check = await qc(file, sb);
    await poster(file, Math.min(1.2, (sb.scenes[0].durationSec ?? 2) / 2), path.join(jobDir, `${sb.variant}.jpg`));
    const renderSec = Math.round((Date.now() - t0) / 1000);
    ledger("renders", { id: sb.id, renderSec, ...check });
    setVideo({ ...base, status: check.ok ? "review" : "qc_failed", file: path.relative(OUT, file).split(path.sep).join("/"), poster: `${jobId}/${sb.variant}.jpg`, qc: check, renderSec, scenes: sb.scenes.map(({ id, role, narration, onScreen, label, claimIds, assetId, durationSec }) => ({ id, role, narration, onScreen, label, claimIds, assetId, durationSec })) });
    log(`${sb.id}: ${check.ok ? "QC ok" : "QC FAILED " + check.issues.join("; ")} (${check.durationSec}s, ${renderSec}s to render)`);
    results.push({ id: sb.id, status: check.ok ? "review" : "qc_failed" });
  }
  buildReview();
  return { jobId, productId: product.id, results };
}

if (process.argv[1] && process.argv[1].endsWith("run.mjs")) {
  const file = process.argv[2];
  if (!file) throw new Error("usage: npm run run-request -- <request.json>");
  const res = await runRequest(readJson(file));
  log(JSON.stringify(res));
  process.exit(0);
}
