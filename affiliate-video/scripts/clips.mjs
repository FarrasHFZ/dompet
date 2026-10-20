// Generated footage via the owner's ChatGPT/Sora subscription (no API key).
// The pipeline writes a prompt pack; the owner pastes each prompt in ChatGPT/Sora, downloads the clips
// and drops them in public/products/<id>/assets/generated/ (named <clipId>.mp4, or any names + `npm run clips -- --assign`).
//   npm run clips -- --product <id>             list which clips are present / missing
//   npm run clips -- --product <id> --assign    rename unnamed downloads to the missing clip ids, in pack order
import fs from "node:fs";
import path from "node:path";
import { PRODUCTS, arg, durationSec, log, probe, readJson, rel, writeJson } from "./lib.mjs";

const EXT = /\.(mp4|mov|webm)$/i;

// Appended to every prompt: what makes it read as UGC, and what keeps it honest and usable under our overlays.
const STYLE =
  "Vertical 9:16 video, shot handheld on a smartphone, natural light, candid everyday moment, realistic Indonesian setting. " +
  "Nobody speaks to the camera or lip-syncs; natural ambient sound only. No on-screen text, captions, logos or watermarks added. " +
  "Keep the lower third of the frame calm (captions go there).";

export const clipDir = (productId) => path.join(PRODUCTS, productId, "assets", "generated");

export function findClip(productId, clipId) {
  const dir = clipDir(productId);
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find((n) => EXT.test(n) && n.replace(EXT, "") === clipId);
  return f ? path.join(dir, f) : null;
}

function phoneLine(product, colour) {
  return `The phone is an ${product.name}${colour ? ` in ${colour}` : ""}: flat edges, a full-width camera plateau across the top of the back with three large lenses on the left. Match the attached reference photo.`;
}

/** Point clip scenes at their files; return the clips that still need generating (deduplicated, in story order). */
export function resolveClips(boards, product) {
  const missing = new Map();
  for (const sb of boards) {
    for (const sc of sb.scenes) {
      if (sc.kind !== "clip") continue;
      const f = findClip(product.id, sc.clipId);
      if (f) {
        sc.assetPath = rel(f);
        sc.assetType = "video";
        sc.layout = "full";
      } else if (!missing.has(sc.clipId)) {
        missing.set(sc.clipId, { clipId: sc.clipId, prompt: sc.prompt, usedIn: [] });
      }
      if (missing.has(sc.clipId)) missing.get(sc.clipId).usedIn.push(`${sb.variant}/${sc.id}`);
    }
  }
  return [...missing.values()];
}

export function writePromptPack(missing, product, jobDir, { colour, refImage } = {}) {
  fs.mkdirSync(jobDir, { recursive: true });
  const dir = clipDir(product.id);
  fs.mkdirSync(dir, { recursive: true });
  if (refImage) fs.copyFileSync(path.join(PRODUCTS, "..", refImage), path.join(dir, "_reference.jpg"));
  const lines = [
    `# Sora prompt pack: ${product.name}`,
    "",
    `${missing.length} clips. For each one: open ChatGPT (Sora), attach the reference photo, paste the prompt, pick **9:16 portrait**, generate, download.`,
    "",
    refImage
      ? "- **Reference photo:** `_reference.jpg` in the clips folder (also sent with this pack). Attach it to every prompt so the phone stays close to the real design."
      : "- **Reference photo:** save a seller photo from the Shopee page and attach it to every prompt.",
    `- **Save clips into:** \`${dir}\``,
    `- **Name each file** exactly as given (e.g. \`${missing[0]?.clipId}.mp4\`). Or keep the download names, drop them in that folder in the order below, and run \`npm run clips -- --product ${product.id} --assign\`.`,
    "- Any length works. 5 s or more is best; only 3-4 s of each is used.",
    "- The pipeline continues by itself once all files are there (`npm run watch` keeps checking).",
    "",
  ];
  missing.forEach((m, i) => {
    lines.push(`## ${i + 1}. \`${m.clipId}.mp4\``, "", "```", `${m.prompt} ${phoneLine(product, colour)} ${STYLE}`, "```", "", `_Used in: ${m.usedIn.join(", ")}_`, "");
  });
  const file = path.join(jobDir, "sora-prompts.md");
  fs.writeFileSync(file, lines.join("\n"));
  writeJson(path.join(dir, "_expected.json"), missing.map((m) => m.clipId));
  return file;
}

if (process.argv[1] && process.argv[1].endsWith("clips.mjs")) {
  const productId = arg("product");
  if (!productId) throw new Error("usage: npm run clips -- --product <id> [--assign]");
  const dir = clipDir(productId);
  const expectedFile = path.join(dir, "_expected.json");
  const expected = fs.existsSync(expectedFile) ? readJson(expectedFile) : [];
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => EXT.test(n)) : [];
  const named = new Set(files.map((f) => f.replace(EXT, "")));
  const missing = expected.filter((c) => !named.has(c));
  if (process.argv.includes("--assign")) {
    const loose = files
      .filter((f) => !expected.includes(f.replace(EXT, "")))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => a.t - b.t);
    for (const [i, { f }] of loose.entries()) {
      if (!missing[i]) break;
      const to = `${missing[i]}${path.extname(f).toLowerCase()}`;
      fs.renameSync(path.join(dir, f), path.join(dir, to));
      log(`${f} -> ${to}`);
    }
  }
  for (const c of expected) {
    const f = findClip(productId, c);
    if (!f) console.log(`missing  ${c}`);
    else {
      const v = (await probe(f)).streams.find((s) => s.codec_type === "video");
      console.log(`ok       ${c}  ${v?.width}x${v?.height}  ${(await durationSec(f)).toFixed(1)}s`);
    }
  }
}
