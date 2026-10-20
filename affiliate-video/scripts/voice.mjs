// Narration per scene with Microsoft Edge neural voices (free, Indonesian: id-ID-GadisNeural / id-ID-ArdiNeural).
// Scene length follows the spoken lines, so pacing comes from the script, not a fixed template.
// Cartoon scenes: each dialogue line is voiced by its speaker and gets a per-frame loudness envelope for lip-sync.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { FPS } from "../src/schema.js";
import { FFMPEG, durationSec, log, rel, run } from "./lib.mjs";

const PAD_SEC = 0.25; // breath after each scene
const GAP_SEC = 0.12; // between dialogue lines
const RATE = process.env.AV_TTS_RATE || "+25%"; // creators talk faster than the default Edge pace

const ttsByVoice = new Map();
async function ttsFor(voice) {
  if (!ttsByVoice.has(voice)) {
    const t = new MsEdgeTTS();
    await t.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    ttsByVoice.set(voice, t);
  }
  return ttsByVoice.get(voice);
}

/** Voice one line into dir, cached on (voice, rate, text). Returns the mp3 path. */
async function speak(text, voice, dir, stem) {
  const key = crypto.createHash("sha1").update(`${voice}|${RATE}|${text}`).digest("hex").slice(0, 8);
  const target = path.join(dir, `${stem}_${key}.mp3`);
  if (fs.existsSync(target)) return target;
  const tmp = path.join(dir, `_tmp_${stem}`);
  fs.mkdirSync(tmp, { recursive: true });
  const { audioFilePath } = await (await ttsFor(voice)).toFile(tmp, text, { rate: RATE });
  // Edge voices pause ~0.9 s at every full stop and pad both ends; trim to a creator's jump-cut rhythm
  await run(FFMPEG, ["-y", "-i", audioFilePath, "-af",
    "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.2:stop_threshold=-45dB:stop_silence=0.12",
    "-c:a", "libmp3lame", "-b:a", "128k", target]);
  fs.rmSync(tmp, { recursive: true, force: true });
  return target;
}

/** Loudness per video frame, 0..1, for mouth movement. */
function envelope(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ["-v", "error", "-i", file, "-f", "s16le", "-ac", "1", "-ar", "24000", "-"], { windowsHide: true });
    const chunks = [];
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("error", reject);
    p.on("close", () => {
      const buf = Buffer.concat(chunks);
      const per = 24000 / FPS;
      const n = Math.floor(buf.length / 2 / per);
      const out = [];
      for (let f = 0; f < n; f++) {
        let sum = 0;
        for (let i = 0; i < per; i++) {
          const v = buf.readInt16LE((f * per + i) * 2) / 32768;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / per);
        out.push(Math.round(Math.min(1, Math.max(0, (rms - 0.02) * 6)) * 100) / 100);
      }
      resolve(out);
    });
  });
}

export async function voiceStoryboard(sb, recipe, dir) {
  fs.mkdirSync(dir, { recursive: true });
  try {
    for (const sc of sb.scenes) {
      const min = sc.role === "hook" ? 1.6 : recipe.pacing.minSceneSec;
      if (sc.kind === "cartoon") {
        let t = 0.15;
        for (const [i, line] of (sc.lines || []).entries()) {
          const voice = sb.characters?.[line.speaker]?.voice ?? sb.voice;
          const file = await speak(line.text, voice, dir, `${sc.id}_l${i}`);
          line.audio = rel(file);
          line.durationSec = Math.round((await durationSec(file)) * 100) / 100;
          line.startSec = Math.round(t * 100) / 100;
          line.env = await envelope(file);
          t += line.durationSec + GAP_SEC;
        }
        sc.durationSec = Math.round(Math.max(min, t + PAD_SEC) * 100) / 100;
      } else {
        const file = await speak(sc.narration, sc.voice ?? sb.voice, dir, sc.id);
        const spoken = await durationSec(file);
        sc.audio = rel(file);
        sc.durationSec = Math.round(Math.max(min, spoken + PAD_SEC) * 100) / 100;
      }
      if (sc.durationSec > recipe.pacing.maxSceneSec + 1) log(`${sb.id}/${sc.id}: scene runs ${sc.durationSec.toFixed(1)}s`);
    }
  } finally {
    for (const t of ttsByVoice.values()) t.close?.();
    ttsByVoice.clear();
  }
  return sb;
}
