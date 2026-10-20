// Narration per scene with Microsoft Edge neural voices (free, Indonesian: id-ID-GadisNeural / id-ID-ArdiNeural).
// Scene length follows the spoken line, so pacing comes from the script, not a fixed template.
import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { durationSec, log, rel } from "./lib.mjs";

const PAD_SEC = 0.35; // breath after each line
const RATE = process.env.AV_TTS_RATE || "+8%"; // creators talk a little faster than the default

export async function voiceStoryboard(sb, recipe, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const tts = new MsEdgeTTS();
  await tts.setMetadata(sb.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  try {
    for (const sc of sb.scenes) {
      const target = path.join(dir, `${sc.id}.mp3`);
      if (!fs.existsSync(target)) {
        const tmp = path.join(dir, `_tmp_${sc.id}`);
        fs.mkdirSync(tmp, { recursive: true });
        const { audioFilePath } = await tts.toFile(tmp, sc.narration, { rate: RATE });
        fs.renameSync(audioFilePath, target);
        fs.rmSync(tmp, { recursive: true, force: true });
      }
      const spoken = await durationSec(target);
      const min = sc.role === "hook" ? 1.6 : recipe.pacing.minSceneSec;
      sc.audio = rel(target);
      sc.durationSec = Math.round(Math.max(min, spoken + PAD_SEC) * 100) / 100;
      if (spoken > recipe.pacing.maxSceneSec) log(`${sb.id}/${sc.id}: line runs ${spoken.toFixed(1)}s (> ${recipe.pacing.maxSceneSec}s)`);
    }
  } finally {
    tts.close?.();
  }
  return sb;
}
