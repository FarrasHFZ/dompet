// Inspiration -> reusable recipe. Input: a reference video you have (downloaded/screen-recorded), never scraped.
//   npm run inspire -- --video ref.mp4 [--notes "why I like it"]
// Extracts cut timings (scene detection) and a 4x3 contact sheet of frames, has Claude read them,
// and writes recipes/insp_<name>_v01.json. Recipes describe mechanisms (hook type, pacing, beats), not content to copy.
import fs from "node:fs";
import path from "node:path";
import { Recipe } from "../src/schema.js";
import { DATA, FFMPEG, RECIPES, arg, claudeJson, durationSec, ledger, log, run, slug, writeJson } from "./lib.mjs";

const video = arg("video");
if (!video) throw new Error("usage: npm run inspire -- --video ref.mp4 [--notes \"...\"]");
const name = slug(path.basename(video, path.extname(video)));
const work = path.join(DATA, "inspiration", name);
fs.mkdirSync(work, { recursive: true });

const dur = await durationSec(video);
const sd = await run(FFMPEG, ["-hide_banner", "-nostats", "-i", video, "-vf", "select='gt(scene,0.32)',showinfo", "-an", "-f", "null", "-"], { capture: "stderr" });
const cuts = [...sd.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(Number(m[1]).toFixed(2)));
const shots = [0, ...cuts, dur].slice(1).map((t, i, arr) => Number((t - (i ? arr[i - 1] : 0)).toFixed(2)));

const sheet = path.join(work, "sheet.jpg");
const step = Math.max(dur / 12, 0.1);
await run(FFMPEG, ["-y", "-i", video, "-vf", `fps=1/${step.toFixed(3)},scale=320:-1,tile=4x3`, "-frames:v", "1", sheet]);
const first = path.join(work, "first.jpg");
await run(FFMPEG, ["-y", "-ss", "0.3", "-i", video, "-frames:v", "1", "-vf", "scale=540:-1", first]);
log(`${name}: ${dur.toFixed(1)}s, ${cuts.length} cuts, avg shot ${(dur / (cuts.length + 1)).toFixed(2)}s`);

const prompt = `You are a short-form video strategist. Analyse a reference video and turn its MECHANISM into a reusable recipe (no copying of its words, people or footage).

Facts measured by ffmpeg:
- duration ${dur.toFixed(1)}s, ${cuts.length} cuts, shot lengths (s): ${shots.join(", ")}
Owner notes: ${arg("notes", "(none)")}

Look at these with the Read tool:
- ${sheet}  (12 frames, left-to-right then top-to-bottom, taken every ${step.toFixed(2)}s)
- ${first}  (the opening frame = the hook)

Return ONLY JSON matching:
{"id":"insp_${name}_v01","name":"...","style":"ugc|motion_graphics|reveal|lifestyle","mechanism":"one line: why it sells",
 "hook":{"maxSec":number,"pattern":"the curiosity mechanism in general terms","examples":["2 NEW Bahasa examples in the same pattern, product-agnostic"]},
 "beats":[{"role":"hook|moment|demo|detail|cta","guidance":"what this beat does, product-agnostic","motion":["handheld|push_in|pull_out|pan_left|pan_right|tilt_up|macro_zoom|static"]}],
 "pacing":{"targetSec":number,"minSceneSec":number,"maxSceneSec":number},
 "captionStyle":"karaoke|chunk|none","cta":"how it points to the purchase","fits":["product categories it suits"],
 "source":"inspiration:${path.basename(video)}","version":1,
 "analysis":{"hook":"...","camera":"...","composition":"...","editing":"...","audio_guess":"...","selling_mechanism":"..."}}
Beats: 4-8, first role hook, last role cta. Pacing must follow the measured shot lengths.`;

const { json, cost } = await claudeJson(prompt, { tools: ["Read"] });
ledger("costs", { step: "inspire", video: name, usd: cost });
const { analysis, ...recipe } = json;
const parsed = Recipe.parse(recipe);
writeJson(path.join(RECIPES, `${parsed.id}.json`), parsed);
writeJson(path.join(work, "analysis.json"), { measured: { dur, cuts, shots }, analysis, recipe: parsed.id });
log(`recipe saved: recipes/${parsed.id}.json`);
