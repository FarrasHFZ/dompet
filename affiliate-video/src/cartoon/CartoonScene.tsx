import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Character, Look, Pose } from "./Character";
import { PhoneScreen } from "./Phone";
import { SetBack, SetFront, SetName } from "./Sets";

export type CastMember = { who: string; pose: Pose; screen?: PhoneScreen };
// env: loudness per frame (0..1), computed from the voice file by scripts/voice.mjs
export type Line = { speaker: string; text: string; audio?: string; startSec?: number; durationSec?: number; env?: number[] };
export type CartoonSceneProps = {
  set: SetName;
  cast: CastMember[];
  lines: Line[];
  looks: Record<string, Look>;
  phoneColor: string;
  sceneId: string;
  captions: (text: string, frames: number) => React.ReactNode;
};

/** Mouth openness for one line at this frame, from the precomputed loudness envelope. */
function mouth(line: Line, frame: number, fps: number) {
  const start = Math.round((line.startSec ?? 0) * fps);
  const i = frame - start;
  if (!line.env || i < 0 || i >= line.env.length) return 0;
  return line.env[i];
}

export const CartoonScene: React.FC<CartoonSceneProps> = ({ set, cast, lines, looks, phoneColor, sceneId, captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mouths = lines.map((l) => ({ speaker: l.speaker, v: mouth(l, frame, fps) }));
  const talking = (who: string) => Math.max(0, ...mouths.filter((m) => m.speaker === who).map((m) => m.v));

  // place one person centred, two people facing each other
  const slots =
    cast.length === 1
      ? [{ cx: 540, top: 330, s: 1.45, flip: false }]
      : [
          { cx: 300, top: 420, s: 1.12, flip: false },
          { cx: 790, top: 430, s: 1.08, flip: true },
        ];

  // phone-camera feel: slow push and a little drift
  const push = 1 + frame / (fps * 60);
  const dx = Math.sin(frame / 23) * 6;
  const dy = Math.cos(frame / 29) * 5;

  const active = lines.find((l) => {
    const st = Math.round((l.startSec ?? 0) * fps);
    return frame >= st && frame < st + Math.round((l.durationSec ?? 0) * fps);
  });

  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1080 1920" width="100%" height="100%" style={{ transform: `translate(${dx}px,${dy}px) scale(${push})` }}>
        <SetBack name={set} frame={frame} />
        {cast.map((c, i) => {
          const sl = slots[i] ?? slots[0];
          const tx = sl.flip ? sl.cx + 200 * sl.s : sl.cx - 200 * sl.s;
          return (
            <g key={c.who} transform={`translate(${tx} ${sl.top}) scale(${sl.flip ? -sl.s : sl.s} ${sl.s})`}>
              <Character look={looks[c.who]} pose={c.pose} screen={c.screen} talking={talking(c.who)} frame={frame} seed={`${sceneId}-${c.who}`} phoneColor={phoneColor} />
            </g>
          );
        })}
        <SetFront name={set} frame={frame} />
      </svg>
      {lines.map((l, i) =>
        l.audio ? (
          <Sequence key={i} from={Math.round((l.startSec ?? 0) * fps)} durationInFrames={Math.max(1, Math.round((l.durationSec ?? 0) * fps))}>
            <Audio src={staticFile(l.audio)} />
          </Sequence>
        ) : null,
      )}
      {active ? (
        <Sequence from={Math.round((active.startSec ?? 0) * fps)} durationInFrames={Math.round((active.durationSec ?? 1) * fps)} layout="none">
          {captions(active.text, Math.round((active.durationSec ?? 1) * fps))}
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
