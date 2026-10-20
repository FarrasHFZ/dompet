// Remotion render (bundle once per process) + technical QC on the finished MP4.
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { FPS, HEIGHT, WIDTH, totalFrames } from "../src/schema.js";
import { FFMPEG, ROOT, log, probe, run } from "./lib.mjs";

let serveUrl;
async function getBundle() {
  if (!serveUrl) {
    log("bundling Remotion project...");
    serveUrl = await bundle({ entryPoint: path.join(ROOT, "src", "index.ts"), publicDir: path.join(ROOT, "public") });
  }
  return serveUrl;
}

/**
 * Precompute the expensive looks once with ffmpeg instead of per frame in Chrome:
 * a blurred, darkened 9:16 background per scene asset, and a film-grain tile.
 * (CSS blur(48px) + SVG feTurbulence per frame rendered at ~1 fps.)
 */
async function prepareLooks(sb) {
  const fx = path.join(ROOT, "public", "fx");
  fs.mkdirSync(fx, { recursive: true });
  const grain = path.join(fx, "grain.png");
  if (!fs.existsSync(grain))
    await run(FFMPEG, ["-y", "-f", "lavfi", "-i", "color=c=gray:s=512x512", "-vf", "noise=alls=70:allf=t", "-frames:v", "1", grain]);
  for (const sc of sb.scenes) {
    if (!sc.assetPath) continue;
    const src = path.join(ROOT, "public", sc.assetPath);
    const at = sc.assetType === "video" ? (sc.startSec ?? 0) + 0.5 : 0;
    const bg = src.replace(/\.(\w+)$/, `.bg${at ? "_" + at.toFixed(1) : ""}.jpg`);
    if (!fs.existsSync(bg)) {
      serveUrl = undefined; // the bundle holds a copy of public/, so new files need a re-bundle
      const pre = sc.assetType === "video" ? ["-ss", String(at)] : [];
      await run(FFMPEG, ["-y", ...pre, "-i", src, "-frames:v", "1", "-vf",
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,scale=270:480,gblur=sigma=14,eq=brightness=-0.2:saturation=1.25", bg]);
    }
    sc.bgPath = path.relative(path.join(ROOT, "public"), bg).split(path.sep).join("/");
  }
  return { grain: "fx/grain.png" };
}

export async function renderStoryboard(sb, product, outFile) {
  const looks = await prepareLooks(sb);
  serveUrl = undefined; // each storyboard brings new voice files into public/; the bundle only has a snapshot
  const url = await getBundle();
  const thumb = product.assets.find((a) => a.type === "image")?.path;
  const inputProps = { ...sb, productThumb: thumb, grain: looks.grain };
  const composition = await selectComposition({ serveUrl: url, id: "UGC", inputProps });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  let last = -1;
  await renderMedia({
    serveUrl: url,
    composition,
    inputProps,
    codec: "h264",
    videoBitrate: "6M", // grain is incompressible; cap size (~20 MB per 25 s)
    audioBitrate: "192k",
    outputLocation: outFile,
    concurrency: Number(process.env.AV_CONCURRENCY || 0) || null,
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 10);
      if (p !== last) {
        last = p;
        process.stdout.write(`\r  rendering ${sb.variant}: ${p * 10}%   `);
      }
    },
  });
  process.stdout.write("\n");
  // TTS comes out around -20 LUFS; feeds normalise to about -14, so quiet uploads sound weak next to creators.
  const tmp = outFile.replace(/\.mp4$/, ".raw.mp4");
  fs.renameSync(outFile, tmp);
  await run(FFMPEG, ["-y", "-i", tmp, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", outFile]);
  fs.rmSync(tmp);
  return outFile;
}

/** Hard checks: format, length, audio present and loud enough, no black/blank stretches. */
export async function qc(file, sb) {
  const issues = [];
  const j = await probe(file);
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  const dur = Number(j.format.duration);
  const expected = totalFrames(sb) / FPS;
  if (!v || v.width !== WIDTH || v.height !== HEIGHT) issues.push(`resolution ${v?.width}x${v?.height}, want ${WIDTH}x${HEIGHT}`);
  if (v?.codec_name !== "h264") issues.push(`codec ${v?.codec_name}`);
  if (!a) issues.push("no audio stream");
  if (Math.abs(dur - expected) > 0.25) issues.push(`duration ${dur.toFixed(2)}s vs storyboard ${expected.toFixed(2)}s`);
  if (dur < 8 || dur > 60) issues.push(`duration ${dur.toFixed(1)}s outside 8-60s`);
  const mb = fs.statSync(file).size / 1e6;
  if (mb > 50) issues.push(`file ${mb.toFixed(1)}MB > 50MB`);

  // loudness (EBU R128). Short-form platforms normalise around -14 LUFS; flag clearly quiet/hot mixes.
  const lo = await run(FFMPEG, ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], { capture: "stderr" }).catch((e) => e.message);
  const lufs = Number((String(lo).match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)?.[0]);
  if (Number.isFinite(lufs) && (lufs < -24 || lufs > -8)) issues.push(`loudness ${lufs} LUFS`);

  // black / blank frames (a missing asset renders as black)
  const bd = await run(FFMPEG, ["-hide_banner", "-nostats", "-i", file, "-vf", "blackdetect=d=0.4:pix_th=0.08", "-an", "-f", "null", "-"], { capture: "stderr" }).catch((e) => e.message);
  const blacks = (String(bd).match(/black_start/g) || []).length;
  if (blacks) issues.push(`${blacks} black stretch(es) >= 0.4s`);

  return { ok: issues.length === 0, issues, durationSec: Math.round(dur * 10) / 10, lufs, sizeMB: Math.round(mb * 10) / 10 };
}

/** Poster frame for the review page. */
export async function poster(file, at, dest) {
  await run(FFMPEG, ["-y", "-ss", String(at), "-i", file, "-frames:v", "1", "-vf", "scale=360:-1", dest]);
  return dest;
}
