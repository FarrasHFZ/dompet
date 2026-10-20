// Prototype of an illustrated UGC scene (two friends, dialogue, lip-sync) without Claude or Shopee.
//   node scripts/smoke-cartoon.mjs [productId]
import path from "node:path";
import { Storyboard } from "../src/schema.js";
import { OUT, JOBS, loadProduct, log } from "./lib.mjs";
import { poster, renderStoryboard } from "./render.mjs";
import { voiceStoryboard } from "./voice.mjs";

const product = loadProduct(process.argv[2] || "apple-iphone-18-pro-max-44518614733");
const sb = Storyboard.parse({
  id: "_cartoon_proto",
  productId: product.id,
  recipeId: "proto",
  variant: "P",
  title: "proto",
  phoneColor: "#6b2433",
  characters: {
    rani: { name: "Rani", voice: "id-ID-GadisNeural", skin: "#c68b5d", hair: "hijab", hairColor: "#e8a598", shirt: "#2f5d62" },
    dimas: { name: "Dimas", voice: "id-ID-ArdiNeural", skin: "#a8703f", hair: "short", hairColor: "#1d1410", shirt: "#f2c14e", accent: "#d9a52f" },
  },
  cta: { text: "Cek keranjang kuning", sub: "Cek varian & harga terbaru di sana" },
  scenes: [
    {
      id: "s1", role: "hook", kind: "cartoon", set: "cafe",
      onScreen: "Temenku langsung nanya: itu HP apa?",
      cast: [{ who: "rani", pose: "show", screen: "food" }, { who: "dimas", pose: "idle" }],
      lines: [
        { speaker: "rani", text: "Eh, lihat deh. Foto makan siang tadi." },
        { speaker: "dimas", text: "Lho, jelas banget. Itu zoom dari jauh?" },
        { speaker: "rani", text: "Iya, zoom 8x kualitas optik.", claimIds: ["c5"] },
      ],
    },
    {
      id: "s2", role: "moment", kind: "cartoon", set: "bedroom", label: "06.30 · Pagi",
      cast: [{ who: "rani", pose: "hold", screen: "calendar" }],
      lines: [{ speaker: "rani", text: "Pagi-pagi, cek jadwal dulu. Layar 6,9 inci, lega.", claimIds: ["c1"] }],
    },
    {
      id: "s3", role: "moment", kind: "cartoon", set: "night", label: "19.30 · Malam",
      cast: [{ who: "dimas", pose: "selfie" }, { who: "rani", pose: "idle" }],
      lines: [
        { speaker: "dimas", text: "Foto bareng yuk, mumpung lampunya bagus." },
        { speaker: "rani", text: "Pakai HP-ku aja, foto minim cahayanya lebih bagus.", claimIds: ["c4"] },
      ],
    },
  ],
});
await voiceStoryboard(sb, { pacing: { minSceneSec: 2, maxSceneSec: 6 } }, path.join(JOBS, "_cartoon_proto"));
log("scene durations:", sb.scenes.map((s) => s.durationSec));
const file = path.join(OUT, "_cartoon_proto", "proto.mp4");
await renderStoryboard(sb, product, file);
await poster(file, 2.2, path.join(OUT, "_cartoon_proto", "still.jpg"));
log("done", file);
