// Performance Lab: import platform/affiliate exports, rank recipes and hooks by commission per 1,000 views.
//   npm run perf -- --import tiktok_export.csv     (columns: video_id,date,views,avg_watch_sec,completion_rate,link_clicks,orders,commission)
//   npm run perf                                    (report)
// video_id = the storyboard id shown on the review page (e.g. <product>_<recipe>_B).
// Ranking shrinks every recipe toward the overall mean with a 20k-view prior, so a lucky first video
// cannot take over production. Nothing adapts automatically until a recipe has real volume behind it.
import fs from "node:fs";
import { arg, ledger, log, readLedger } from "./lib.mjs";
import { loadVideos } from "./registry.mjs";

const PRIOR_KVIEWS = 20;
const MIN_VIDEOS_TO_EXPLOIT = 30;

function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const cols = head.split(",").map((c) => c.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], isNaN(Number(v)) ? v.trim() : Number(v)])));
}

/** Latest snapshot per video (exports are cumulative). */
function latestByVideo() {
  const m = {};
  for (const r of readLedger("performance")) if (!m[r.video_id] || (r.date || r.at) >= (m[r.video_id].date || m[r.video_id].at)) m[r.video_id] = r;
  return m;
}

export function scoreboard(key = "recipeId") {
  const vids = loadVideos();
  const perf = latestByVideo();
  const groups = {};
  let views = 0;
  let comm = 0;
  for (const [id, p] of Object.entries(perf)) {
    const v = vids[id];
    if (!v) continue;
    const k = key === "hook" ? (v.experiment?.variable === "hook" ? v.experiment.value : null) : v[key];
    if (!k) continue;
    const g = (groups[k] ||= { key: k, videos: 0, views: 0, clicks: 0, orders: 0, commission: 0 });
    g.videos++;
    g.views += p.views || 0;
    g.clicks += p.link_clicks || 0;
    g.orders += p.orders || 0;
    g.commission += p.commission || 0;
    views += p.views || 0;
    comm += p.commission || 0;
  }
  const mean = views ? comm / (views / 1000) : 0;
  return Object.values(groups)
    .map((g) => ({
      ...g,
      ctr: g.views ? g.clicks / g.views : 0,
      cvr: g.clicks ? g.orders / g.clicks : 0,
      rawPerK: g.views ? g.commission / (g.views / 1000) : 0,
      shrunkPerK: (g.commission + PRIOR_KVIEWS * mean) / (g.views / 1000 + PRIOR_KVIEWS),
    }))
    .sort((a, b) => b.shrunkPerK - a.shrunkPerK);
}

/** Recipes that fit the product's category; exploit the best only once there is enough evidence, always keep one exploration slot. */
export function pickRecipes(product, recipes, n = 1) {
  const cat = (product.category || "").toLowerCase();
  const fit = recipes.filter((r) => !cat || r.fits.some((f) => cat.includes(f) || f.includes(cat)));
  const pool = fit.length ? fit : recipes;
  const board = Object.fromEntries(scoreboard("recipeId").map((s) => [s.key, s]));
  const totalVideos = Object.values(board).reduce((a, s) => a + s.videos, 0);
  if (totalVideos < MIN_VIDEOS_TO_EXPLOIT) {
    // not enough data: rotate, least-tested first
    return [...pool].sort((a, b) => (board[a.id]?.videos ?? 0) - (board[b.id]?.videos ?? 0)).slice(0, n);
  }
  const ranked = [...pool].sort((a, b) => (board[b.id]?.shrunkPerK ?? 0) - (board[a.id]?.shrunkPerK ?? 0));
  if (n === 1) return ranked.slice(0, 1);
  const explore = [...pool].sort((a, b) => (board[a.id]?.videos ?? 0) - (board[b.id]?.videos ?? 0))[0];
  return [...new Set([...ranked.slice(0, n - 1), explore])].slice(0, n);
}

if (process.argv[1] && process.argv[1].endsWith("perf.mjs")) {
  const file = arg("import");
  if (file) {
    const rows = parseCsv(fs.readFileSync(file, "utf8"));
    for (const r of rows) ledger("performance", r);
    log(`imported ${rows.length} rows`);
  }
  for (const key of ["recipeId", "hook"]) {
    const b = scoreboard(key);
    console.log(`\n== by ${key} (commission per 1k views, shrunk toward mean with ${PRIOR_KVIEWS}k-view prior) ==`);
    if (!b.length) console.log("no data yet");
    for (const s of b)
      console.log(`${s.key.padEnd(34)} videos ${String(s.videos).padStart(3)}  views ${String(s.views).padStart(8)}  CTR ${(s.ctr * 100).toFixed(2)}%  CVR ${(s.cvr * 100).toFixed(1)}%  raw ${s.rawPerK.toFixed(0)}  shrunk ${s.shrunkPerK.toFixed(0)}`);
  }
  const n = Object.keys(latestByVideo()).length;
  if (n < MIN_VIDEOS_TO_EXPLOIT) console.log(`\n${n}/${MIN_VIDEOS_TO_EXPLOIT} videos with data: recipe selection still rotates (no adaptive picking yet).`);
}
