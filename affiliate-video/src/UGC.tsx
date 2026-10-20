import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/PlusJakartaSans";
import { FPS } from "./schema.js";

const { fontFamily } = loadFont("normal", { weights: ["500", "800"], subsets: ["latin"] });

type Scene = {
  id: string;
  role: string;
  motion: string;
  layout?: "card" | "full";
  narration: string;
  onScreen?: string;
  label?: string;
  audio?: string;
  durationSec?: number;
  assetPath?: string;
  assetType?: "image" | "video";
};

export type StoryboardProps = {
  id: string;
  title: string;
  disclosure: string;
  cta: { text: string; sub?: string };
  scenes: Scene[];
  music?: string;
  productThumb?: string;
};

// TikTok/Reels UI covers the top ~150px, the bottom ~420px and the right ~140px.
const SAFE = { top: 150, bottom: 420, side: 70, right: 150 };
const YELLOW = "#FFE14D";

const src = (p?: string) => (p ? (/^https?:/.test(p) ? p : staticFile(p)) : "");

/** Camera move for a scene, plus a light handheld drift on everything so it reads as a phone, not a slideshow. */
function useCamera(motion: string, durationInFrames: number, seed: string) {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });
  const ease = (t: number) => 1 - Math.pow(1 - t, 2);
  let scale = 1.04;
  let x = 0;
  let y = 0;
  let rot = 0;
  switch (motion) {
    case "push_in": scale = interpolate(ease(p), [0, 1], [1.0, 1.14]); break;
    case "pull_out": scale = interpolate(ease(p), [0, 1], [1.16, 1.02]); break;
    case "pan_left": x = interpolate(p, [0, 1], [50, -50]); scale = 1.12; break;
    case "pan_right": x = interpolate(p, [0, 1], [-50, 50]); scale = 1.12; break;
    case "tilt_up": y = interpolate(p, [0, 1], [60, -60]); scale = 1.12; break;
    case "macro_zoom": scale = interpolate(ease(p), [0, 1], [1.35, 1.6]); break;
    case "static": scale = 1.02; break;
    default: scale = 1.06; // handheld
  }
  const amp = motion === "static" ? 0.3 : motion === "handheld" ? 1.6 : 1;
  const s = random(seed) * 100;
  x += amp * (Math.sin(f / 9 + s) * 7 + Math.sin(f / 3.7 + s * 2) * 2);
  y += amp * (Math.cos(f / 11 + s) * 6 + Math.sin(f / 4.3 + s) * 2);
  rot += amp * Math.sin(f / 17 + s) * 0.5;
  // cut "punch": a short zoom settle at the start of every scene
  const punch = interpolate(f, [0, 5], [0.06, 0], { extrapolateRight: "clamp" });
  return `translate(${x}px, ${y}px) scale(${scale + punch}) rotate(${rot}deg)`;
}

const Media: React.FC<{ scene: Scene; frames: number }> = ({ scene, frames }) => {
  const transform = useCamera(scene.motion, frames, scene.id);
  const url = src(scene.assetPath);
  const el = (style: React.CSSProperties) =>
    scene.assetType === "video" ? (
      <OffthreadVideo src={url} muted style={style} />
    ) : (
      <Img src={url} style={style} />
    );

  if (scene.layout === "full") {
    return (
      <AbsoluteFill style={{ transform }}>
        {el({ width: "100%", height: "100%", objectFit: "cover" })}
      </AbsoluteFill>
    );
  }
  // card: seller photos are square on white; float them over a blurred, darkened copy of themselves
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: "scale(1.35)", filter: "blur(48px) brightness(0.55) saturate(1.2)" }}>
        {el({ width: "100%", height: "100%", objectFit: "cover" })}
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform }}>
        <div
          style={{
            width: 940,
            height: 940,
            marginTop: -120,
            borderRadius: 44,
            overflow: "hidden",
            background: "#fff",
            boxShadow: "0 40px 90px rgba(0,0,0,.55)",
          }}
        >
          {el({ width: "100%", height: "100%", objectFit: scene.assetType === "video" ? "cover" : "contain" })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Word-by-word captions. Word timing is spread over the voice line in proportion to word length. */
const Captions: React.FC<{ text: string; frames: number }> = ({ text, frames }) => {
  const f = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const lead = 4; // frames of silence the TTS adds before speech
  const speech = Math.max(1, frames - lead - 8);
  const weights = words.map((w) => w.length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const starts = weights.map((w) => {
    const s = lead + (acc / total) * speech;
    acc += w;
    return s;
  });
  let active = 0;
  for (let i = 0; i < words.length; i++) if (f >= starts[i]) active = i;
  const CHUNK = 4;
  const chunkStart = Math.floor(active / CHUNK) * CHUNK;
  const chunk = words.slice(chunkStart, chunkStart + CHUNK);
  const pop = spring({ frame: f - starts[active], fps: FPS, config: { damping: 12, mass: 0.4 } });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: SAFE.bottom + 40, paddingLeft: SAFE.side, paddingRight: SAFE.right }}>
      <div style={{ textAlign: "center", lineHeight: 1.15, fontFamily, fontWeight: 800, fontSize: 74 }}>
        {chunk.map((w, i) => {
          const idx = chunkStart + i;
          const isActive = idx === active;
          return (
            <span
              key={idx}
              style={{
                display: "inline-block",
                margin: "0 10px",
                color: isActive ? YELLOW : "#fff",
                opacity: idx <= active ? 1 : 0.85,
                transform: isActive ? `scale(${1 + 0.12 * pop})` : undefined,
                WebkitTextStroke: "10px #000",
                paintOrder: "stroke fill",
                textShadow: "0 6px 18px rgba(0,0,0,.5)",
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const HookText: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  const s = spring({ frame: f, fps: FPS, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: SAFE.top + 90, paddingLeft: SAFE.side, paddingRight: SAFE.side }}>
      <div
        style={{
          transform: `scale(${0.7 + 0.3 * s}) rotate(${-2 + 2 * s}deg)`,
          opacity: s,
          background: "#fff",
          color: "#111",
          fontFamily,
          fontWeight: 800,
          fontSize: 64,
          lineHeight: 1.12,
          padding: "22px 34px",
          borderRadius: 22,
          textAlign: "center",
          maxWidth: 900,
          boxShadow: "0 18px 40px rgba(0,0,0,.35)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const Label: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  const x = interpolate(f, [0, 8], [-40, 0], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: SAFE.top + 70,
        left: SAFE.side,
        transform: `translateX(${x}px)`,
        opacity: interpolate(f, [0, 8], [0, 1], { extrapolateRight: "clamp" }),
        background: "rgba(0,0,0,.6)",
        color: "#fff",
        fontFamily,
        fontWeight: 800,
        fontSize: 40,
        padding: "12px 24px",
        borderRadius: 999,
        border: `3px solid ${YELLOW}`,
      }}
    >
      {text}
    </div>
  );
};

const CtaCard: React.FC<{ cta: StoryboardProps["cta"]; thumb?: string }> = ({ cta, thumb }) => {
  const f = useCurrentFrame();
  const s = spring({ frame: f, fps: FPS, config: { damping: 13 } });
  const bob = Math.sin(f / 4) * 10;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: SAFE.bottom - 120 }}>
      <div style={{ fontSize: 90, transform: `translateY(${bob}px)`, marginBottom: 10 }}>👇</div>
      <div
        style={{
          transform: `translateY(${(1 - s) * 300}px)`,
          display: "flex",
          alignItems: "center",
          gap: 26,
          background: "#fff",
          borderRadius: 30,
          padding: "22px 30px",
          width: 860,
          boxShadow: "0 24px 60px rgba(0,0,0,.45)",
          fontFamily,
        }}
      >
        {thumb ? <Img src={src(thumb)} style={{ width: 150, height: 150, borderRadius: 18, objectFit: "contain", background: "#f4f4f4" }} /> : null}
        <div>
          <div style={{ fontWeight: 800, fontSize: 48, color: "#EE4D2D", lineHeight: 1.1 }}>{cta.text}</div>
          {cta.sub ? <div style={{ fontWeight: 500, fontSize: 34, color: "#333", marginTop: 8 }}>{cta.sub}</div> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Grain: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.45) 100%)" }} />
      <svg width="100%" height="100%" style={{ position: "absolute", opacity: 0.07, mixBlendMode: "overlay" }}>
        <filter id="n">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={f % 30} />
        </filter>
        <rect width="100%" height="100%" filter="url(#n)" />
      </svg>
    </AbsoluteFill>
  );
};

export const UGC: React.FC<StoryboardProps> = (props) => {
  const { fps } = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily }}>
      {props.scenes.map((sc) => {
        const frames = Math.max(1, Math.round((sc.durationSec ?? 2) * fps));
        const start = from;
        from += frames;
        return (
          <Sequence key={sc.id} from={start} durationInFrames={frames} name={`${sc.role}:${sc.id}`}>
            <Media scene={sc} frames={frames} />
            <Grain />
            {sc.label ? <Label text={sc.label} /> : null}
            {sc.onScreen ? <HookText text={sc.onScreen} /> : null}
            {sc.role === "cta" ? <CtaCard cta={props.cta} thumb={props.productThumb} /> : <Captions text={sc.narration} frames={frames} />}
            {sc.audio ? <Audio src={src(sc.audio)} /> : null}
          </Sequence>
        );
      })}
      {props.music ? <Audio src={src(props.music)} volume={0.12} loop /> : null}
      <div
        style={{
          position: "absolute",
          top: SAFE.top,
          left: SAFE.side,
          color: "rgba(255,255,255,.85)",
          fontSize: 28,
          fontWeight: 500,
          background: "rgba(0,0,0,.35)",
          padding: "6px 14px",
          borderRadius: 10,
        }}
      >
        {props.disclosure}
      </div>
    </AbsoluteFill>
  );
};
