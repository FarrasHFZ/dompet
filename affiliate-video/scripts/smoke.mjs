// Offline smoke test of voice -> render -> QC with a synthetic product (no Claude, no Shopee).
//   node scripts/smoke.mjs
import fs from "node:fs";
import path from "node:path";
import { Storyboard } from "../src/schema.js";
import { checkStoryboard } from "./guard.mjs";
import { FFMPEG, JOBS, OUT, PRODUCTS, log, rel, run } from "./lib.mjs";
import { qc, renderStoryboard } from "./render.mjs";
import { voiceStoryboard } from "./voice.mjs";

const dir = path.join(PRODUCTS, "_smoke", "assets");
fs.mkdirSync(dir, { recursive: true });
const img = path.join(dir, "img_1.jpg");
const img2 = path.join(dir, "img_2.jpg");
if (!fs.existsSync(img)) await run(FFMPEG, ["-y", "-f", "lavfi", "-i", "testsrc2=size=1000x1000:duration=1", "-frames:v", "1", img]);
if (!fs.existsSync(img2)) await run(FFMPEG, ["-y", "-f", "lavfi", "-i", "smptehdbars=size=1000x1000:duration=1", "-frames:v", "1", img2]);
const product = {
  id: "_smoke",
  name: "Smoke Test Product",
  claims: [{ id: "c1", text: "baterai 5000 mAh", quote: "5000 mAh", source: "manual" }],
  assets: [
    { id: "img_1", type: "image", path: rel(img), origin: "seller" },
    { id: "img_2", type: "image", path: rel(img2), origin: "seller" },
  ],
};
const recipe = { pacing: { minSceneSec: 2, maxSceneSec: 5 } };
const sb = Storyboard.parse({
  id: "_smoke_A",
  productId: "_smoke",
  recipeId: "test",
  variant: "A",
  title: "smoke",
  cta: { text: "Cek keranjang kuning", sub: "Cek varian & harga terbaru di sana" },
  scenes: [
    { id: "s1", role: "hook", assetId: "img_1", assetPath: rel(img), assetType: "image", motion: "push_in", narration: "Jujur, ini yang paling sering kupegang.", onScreen: "POV: seharian bareng satu barang" },
    { id: "s2", role: "moment", assetId: "img_2", assetPath: rel(img2), assetType: "image", motion: "handheld", layout: "full", narration: "Pagi buru-buru, baterai 5000 mAh bikin tenang.", label: "07.00 · Pagi", claimIds: ["c1"] },
    { id: "s3", role: "cta", assetId: "img_1", assetPath: rel(img), assetType: "image", motion: "static", narration: "Linknya aku taruh di bawah ya." },
  ],
});
log("guard:", checkStoryboard(sb, product));
await voiceStoryboard(sb, recipe, path.join(JOBS, "_smoke", "A"));
log("durations:", sb.scenes.map((s) => s.durationSec));
const file = path.join(OUT, "_smoke", "A.mp4");
await renderStoryboard(sb, product, file);
log("qc:", await qc(file, sb));
