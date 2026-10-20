import React from "react";
import { Composition } from "remotion";
import { UGC, StoryboardProps } from "./UGC";
import { FPS, WIDTH, HEIGHT, totalFrames } from "./schema.js";

// Studio preview uses the most recent job's storyboard if one was copied to public/preview.json;
// renders always pass inputProps explicitly.
const placeholder: StoryboardProps = {
  id: "placeholder",
  title: "Placeholder",
  disclosure: "Konten dibuat dengan AI · Link afiliasi",
  cta: { text: "Cek produknya di bawah", sub: "Harga & promo terbaru di keranjang" },
  scenes: [
    { id: "s1", role: "hook", motion: "push_in", narration: "Jujur aku nggak nyangka bakal sesuka ini.", onScreen: "POV: seharian ditemani satu barang", durationSec: 2.5 },
    { id: "s2", role: "moment", motion: "handheld", narration: "Pagi pertama yang kucek ya ini.", label: "07.00 · Pagi", durationSec: 2.5 },
    { id: "s3", role: "cta", motion: "static", narration: "Linknya di bawah ya.", durationSec: 2.5 },
  ],
};

export const Root: React.FC = () => (
  <Composition
    id="UGC"
    component={UGC as unknown as React.FC<Record<string, unknown>>}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    durationInFrames={totalFrames(placeholder)}
    defaultProps={placeholder as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props as unknown as StoryboardProps) })}
  />
);
