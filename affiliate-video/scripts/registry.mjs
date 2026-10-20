// Video registry (data/videos.json) and the static review page (out/review.html).
// Status flow: blocked | qc_failed | review -> approved | rejected -> published
import fs from "node:fs";
import path from "node:path";
import { DATA, OUT, exists, readJson, writeJson } from "./lib.mjs";

const FILE = path.join(DATA, "videos.json");

export const loadVideos = () => (exists(FILE) ? readJson(FILE) : {});

export function setVideo(v) {
  const all = loadVideos();
  all[v.id] = { ...(all[v.id] || {}), ...v, updatedAt: new Date().toISOString() };
  writeJson(FILE, all);
  return all[v.id];
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function buildReview() {
  const vids = Object.values(loadVideos()).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const byJob = {};
  for (const v of vids) (byJob[v.jobId] ||= []).push(v);
  const badge = { review: "#b26b00", approved: "#1a7f37", published: "#0b5cad", rejected: "#888", blocked: "#c62828", qc_failed: "#c62828" };
  const card = (v) => `
  <article class="card">
    ${v.file ? `<video src="${esc(v.file)}" poster="${esc(v.poster || "")}" controls preload="none" playsinline></video>` : `<div class="novid">not rendered</div>`}
    <div class="meta">
      <div class="row"><b>${esc(v.variant)}</b> <span class="badge" style="background:${badge[v.status] || "#555"}">${esc(v.status)}</span></div>
      <div class="muted">${esc(v.recipeId)}${v.experiment ? ` · ${esc(v.experiment.variable)} = ${esc(v.experiment.value)}` : ""}</div>
      ${v.qc ? `<div class="muted">${v.qc.durationSec}s · ${v.qc.lufs ?? "?"} LUFS · ${v.qc.sizeMB}MB${v.qc.issues.length ? ` · <span class="bad">${esc(v.qc.issues.join("; "))}</span>` : ""}</div>` : ""}
      ${v.guard ? `<ul class="bad">${v.guard.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}
      <details><summary>Script</summary><ol>${(v.scenes || []).map((s) => `<li><span class="muted">${esc(s.role)} · ${esc(s.assetId)} · ${s.durationSec ?? "?"}s${s.claimIds?.length ? " · " + esc(s.claimIds.join(",")) : ""}</span><br>${s.onScreen ? `<b>${esc(s.onScreen)}</b><br>` : ""}${esc(s.narration)}</li>`).join("")}</ol></details>
      ${v.caption ? `<details><summary>Post caption</summary><p class="cap">${esc(v.caption)}</p><button onclick="navigator.clipboard.writeText(this.previousElementSibling.innerText)">Copy</button></details>` : ""}
      <code>npm run approve -- ${esc(v.id)}</code>
    </div>
  </article>`;
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Video Review</title>
<style>
:root{--bg:#f6f6f4;--fg:#1d1d1b;--card:#fff;--muted:#6b6b66;--line:#e4e3de}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecebe6;--card:#1f1f1d;--muted:#9a9a93;--line:#30302d}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}
main{max-width:1200px;margin:0 auto;padding:16px}
h1{font-size:22px} h2{font-size:17px;margin:28px 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
video,.novid{width:100%;aspect-ratio:9/16;background:#000;display:block}
.novid{display:grid;place-items:center;color:#aaa}
.meta{padding:10px 12px;display:grid;gap:6px}
.row{display:flex;justify-content:space-between;align-items:center}
.badge{color:#fff;border-radius:99px;padding:2px 10px;font-size:12px}
.muted{color:var(--muted);font-size:13px} .bad{color:#c62828;font-size:13px}
code{font-size:12px;word-break:break-all;color:var(--muted)} ol{padding-left:18px} li{margin:6px 0}
.cap{white-space:pre-wrap}
</style></head><body><main>
<h1>Video review</h1>
<p class="muted">Approve only what you would post yourself. Variants within a job differ in one thing (see the experiment line) so the results stay readable.</p>
${Object.entries(byJob).map(([job, vs]) => `<h2>${esc(job)} · ${esc(vs[0].title || vs[0].productId)}</h2><div class="grid">${vs.sort((a, b) => a.variant.localeCompare(b.variant)).map(card).join("")}</div>`).join("")}
</main></body></html>`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "review.html"), html);
  return path.join(OUT, "review.html");
}

if (process.argv[1] && process.argv[1].endsWith("registry.mjs")) console.log(buildReview());
