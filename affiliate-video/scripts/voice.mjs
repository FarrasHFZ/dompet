// Narration per scene with Microsoft Edge neural voices (free, Indonesian: id-ID-GadisNeural / id-ID-ArdiNeural).
// Scene length follows the spoken line, so pacing comes from the script, not a fixed template.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { FFMPEG, durationSec, log, rel, run } from "./lib.mjs";

const PAD_SEC = 0.25; // breath after each line
const RATE = process.env.AV_TTS_RATE || "+25%"; // creators talk faster than the default Edge pace

export async function voiceStoryboard(sb, recipe, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const tts = new MsEdgeTTS();
  await tts.setMetadata(sb.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  try {
    for (const sc of sb.scenes) {
      const key = crypto.createHash("sha1").update(`${sb.voice}|${RATE}|${sc.narration}`).digest("hex").slice(0, 8);
      const target = path.join(dir, `${sc.id}_${key}.mp3`); // cache keyed on the line, so edits re-voice
      if (!fs.existsSync(target)) {
        const tmp = path.join(dir, `_tmp_${sc.id}`);
        fs.mkdirSync(tmp, { recursive: true });
        const { audioFilePath } = await tts.toFile(tmp, sc.narration, { rate: RATE });
        // Edge voices pause ~0.9 s at every full stop and pad both ends; trim to a creator's jump-cut rhythm
        await run(FFMPEG, ["-y", "-i", audioFilePath, "-af",
          "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.2:stop_threshold=-45dB:stop_silence=0.12",
          "-c:a", "libmp3lame", "-b:a", "128k", target]);
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
