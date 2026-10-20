// Shared helpers for the pipeline scripts: paths, JSON IO, the Claude CLI, ffmpeg/ffprobe, logging.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC = path.join(ROOT, "public");
export const PRODUCTS = path.join(PUBLIC, "products");
export const JOBS = path.join(PUBLIC, "jobs");
export const OUT = path.join(ROOT, "out");
export const RECIPES = path.join(ROOT, "recipes");
export const REQUESTS = path.join(ROOT, "requests");
export const DATA = path.join(ROOT, "data");

// Full ffmpeg build from ffmpeg-static (Remotion's bundled one lacks ebur128/blackdetect/select/tile);
// Remotion's ffprobe is complete enough for probing.
import ffmpegStatic from "ffmpeg-static";
const BIN = path.join(ROOT, "node_modules", "@remotion", "compositor-win32-x64-msvc");
export const FFMPEG = process.env.AV_FFMPEG || ffmpegStatic || "ffmpeg";
export const FFPROBE = fs.existsSync(path.join(BIN, "ffprobe.exe")) ? path.join(BIN, "ffprobe.exe") : "ffprobe";

export const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const writeJson = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
};
export const exists = (p) => fs.existsSync(p);
export const rel = (abs) => path.relative(PUBLIC, abs).split(path.sep).join("/");
export const stamp = () => new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
export const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

export function log(...a) {
  console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...a);
}

// Resolves with stdout, or stderr when capture === "stderr" (ffmpeg reports filters there).
export function run(cmd, args, { input, cwd = ROOT, shell = false, capture = "stdout" } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, shell, windowsHide: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(capture === "stderr" ? err : out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-2000)}`))));
    if (input != null) p.stdin.end(input);
    else p.stdin.end();
  });
}

export async function probe(file) {
  const out = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  return JSON.parse(out);
}

export async function durationSec(file) {
  const j = await probe(file);
  return Number(j.format?.duration ?? 0);
}

/**
 * Ask Claude (headless Claude Code, uses the local login, no API key) and parse a JSON answer.
 * `tools` lets it Read local files such as product photos for the vision pass.
 */
export async function claudeJson(prompt, { tools = [], model = process.env.AV_MODEL, retries = 2 } = {}) {
  const args = ["-p", "--output-format", "json"];
  if (model) args.push("--model", model); // default: whatever the CLI login defaults to
  if (tools.length) args.push("--allowedTools", tools.join(","));
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const raw = await run("claude", args, { input: prompt, shell: process.platform === "win32" });
      const env = JSON.parse(raw);
      const text = String(env.result ?? "");
      return { json: extractJson(text), cost: env.total_cost_usd ?? 0 };
    } catch (e) {
      lastErr = e;
      log(`claude attempt ${i + 1} failed: ${String(e.message).slice(0, 300)}`);
    }
  }
  throw lastErr;
}

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const a = Math.min(...["{", "["].map((c) => body.indexOf(c)).filter((x) => x >= 0));
  const b = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (!Number.isFinite(a) || b < a) throw new Error("no JSON in Claude answer: " + text.slice(0, 300));
  return JSON.parse(body.slice(a, b + 1));
}

export function loadRecipes() {
  return fs
    .readdirSync(RECIPES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(path.join(RECIPES, f)));
}

export function loadProduct(id) {
  return readJson(path.join(PRODUCTS, id, "product.json"));
}

/** Append one row to a JSONL ledger (jobs, costs, performance). */
export function ledger(name, row) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.appendFileSync(path.join(DATA, `${name}.jsonl`), JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n");
}

export function readLedger(name) {
  const p = path.join(DATA, `${name}.jsonl`);
  if (!exists(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
