import React from "react";
import { random } from "remotion";
import { Phone, PhoneScreen } from "./Phone";

// Upper-body character drawn in a 400 x 1000 box (head at the top, torso down to ~760).
// Everything is plain SVG so Remotion renders it frame by frame with no external assets.

export type Look = {
  skin: string;
  hair: "short" | "long" | "hijab" | "bun";
  hairColor: string; // hijab colour when hair = hijab
  shirt: string;
  accent?: string; // collar / pattern
};

export type Pose = "idle" | "hold" | "show" | "ear" | "selfie" | "point";

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

type P = { x: number; y: number };
const SHOULDER_L: P = { x: 118, y: 372 };
const SHOULDER_R: P = { x: 282, y: 372 };

/** Hand targets and where the phone sits for each pose. */
const POSES: Record<Pose, { l: P; r: P; phone?: { x: number; y: number; face: "front" | "back"; rot: number } ; gaze: P }> = {
  idle: { l: { x: 150, y: 700 }, r: { x: 250, y: 700 }, gaze: { x: 0, y: 0 } },
  hold: { l: { x: 168, y: 585 }, r: { x: 232, y: 585 }, phone: { x: 200, y: 520, face: "back", rot: 0 }, gaze: { x: 0, y: 7 } },
  show: { l: { x: 150, y: 700 }, r: { x: 318, y: 520 }, phone: { x: 322, y: 430, face: "front", rot: 8 }, gaze: { x: 4, y: 0 } },
  ear: { l: { x: 150, y: 700 }, r: { x: 292, y: 262 }, phone: { x: 300, y: 205, face: "back", rot: -12 }, gaze: { x: -3, y: 0 } },
  selfie: { l: { x: 150, y: 700 }, r: { x: 352, y: 210 }, phone: { x: 356, y: 150, face: "back", rot: -6 }, gaze: { x: 5, y: -5 } },
  point: { l: { x: 168, y: 585 }, r: { x: 300, y: 560 }, phone: { x: 190, y: 525, face: "front", rot: -4 }, gaze: { x: 0, y: 7 } },
};

function arm(s: P, h: P, out: number) {
  const mx = (s.x + h.x) / 2;
  const my = (s.y + h.y) / 2;
  const dx = h.x - s.x;
  const dy = h.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  // elbow bends outward/down
  const cx = mx + (-dy / len) * out;
  const cy = my + (dx / len) * out * (out > 0 ? 1 : -1) * 0.2 + 40;
  return `M${s.x},${s.y} Q${cx},${cy} ${h.x},${h.y}`;
}

export const Character: React.FC<{
  look: Look;
  pose: Pose;
  talking: number; // 0..1 mouth openness
  frame: number;
  seed: string;
  screen?: PhoneScreen;
  phoneColor?: string;
}> = ({ look, pose, talking, frame, seed, screen = "lock", phoneColor = "#6b2433" }) => {
  const p = POSES[pose];
  const s = random(seed) * 1000;
  // blink every ~3-4 s for 4 frames
  const period = 100 + Math.floor(random(seed + "b") * 30);
  const blink = (frame + Math.floor(s)) % period < 4;
  const breathe = Math.sin(frame / 22 + s) * 3;
  const bob = talking > 0.05 ? Math.sin(frame / 3.2) * 2.5 * talking : 0;
  const tilt = Math.sin(frame / 41 + s) * 1.6 + (pose === "hold" || pose === "point" ? 4 : 0);
  const skinDark = shade(look.skin, 0.86);
  const shirtDark = shade(look.shirt, 0.82);
  const g = p.gaze;

  const head = (
    <g transform={`translate(0 ${bob}) rotate(${tilt} 200 260)`}>
      {/* hair / hijab behind the face */}
      {look.hair === "long" && <rect x={98} y={110} width={204} height={290} rx={100} fill={look.hairColor} />}
      {look.hair === "hijab" && (
        <>
          <path d="M70,420 Q60,250 120,150 Q200,70 280,150 Q340,250 330,420 Q200,470 70,420Z" fill={look.hairColor} />
          <ellipse cx={200} cy={200} rx={112} ry={126} fill={look.hairColor} />
        </>
      )}
      {look.hair === "bun" && <circle cx={200} cy={78} r={42} fill={look.hairColor} />}
      {/* face */}
      <ellipse cx={200} cy={196} rx={look.hair === "hijab" ? 76 : 86} ry={look.hair === "hijab" ? 88 : 98} fill={look.skin} />
      {look.hair !== "hijab" && (
        <>
          <ellipse cx={113} cy={205} rx={14} ry={20} fill={look.skin} />
          <ellipse cx={287} cy={205} rx={14} ry={20} fill={look.skin} />
        </>
      )}
      {/* fringe */}
      {look.hair === "short" && <path d="M110,190 Q100,80 200,78 Q300,80 292,190 Q282,128 236,122 Q206,150 150,128 Q118,142 110,190Z" fill={look.hairColor} />}
      {(look.hair === "long" || look.hair === "bun") && (
        <path d="M112,200 Q104,92 200,88 Q298,92 290,200 Q270,130 200,126 Q140,128 112,200Z" fill={look.hairColor} />
      )}
      {look.hair === "hijab" && <path d="M124,170 Q140,98 200,94 Q262,98 276,170 Q250,120 200,118 Q150,120 124,170Z" fill={shade(look.hairColor, 0.9)} />}
      {/* brows */}
      <path d={`M150,${162 - talking * 4} q18,-9 34,-2`} stroke={shade(look.hairColor === "#ffffff" ? "#333333" : "#2a1a12", 1)} strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={`M216,${160 - talking * 4} q16,-7 34,2`} stroke="#2a1a12" strokeWidth={6} fill="none" strokeLinecap="round" />
      {/* eyes */}
      {[167, 233].map((ex) =>
        blink ? (
          <path key={ex} d={`M${ex - 10},196 q10,5 20,0`} stroke="#1b1b1b" strokeWidth={4} fill="none" strokeLinecap="round" />
        ) : (
          <g key={ex}>
            <ellipse cx={ex} cy={196} rx={11} ry={13} fill="#fff" />
            <circle cx={ex + g.x} cy={197 + g.y} r={7.5} fill="#1b1b1b" />
            <circle cx={ex + g.x + 2.5} cy={194 + g.y} r={2.3} fill="#fff" />
          </g>
        ),
      )}
      {/* cheeks + nose */}
      <circle cx={146} cy={232} r={14} fill="#ff8a7a" opacity={0.28} />
      <circle cx={254} cy={232} r={14} fill="#ff8a7a" opacity={0.28} />
      <path d="M200,206 q-7,18 2,22" stroke={skinDark} strokeWidth={4} fill="none" strokeLinecap="round" />
      {/* mouth */}
      {talking > 0.06 ? (
        <g>
          <ellipse cx={200} cy={252} rx={17 + talking * 3} ry={4 + talking * 15} fill="#6b2a2a" />
          <ellipse cx={200} cy={252 + talking * 8} rx={10} ry={3 + talking * 5} fill="#e0716f" />
        </g>
      ) : (
        <path d="M182,248 q18,14 36,0" stroke="#6b2a2a" strokeWidth={5} fill="none" strokeLinecap="round" />
      )}
    </g>
  );

  const phoneEl = p.phone ? (
    <g transform={`translate(${p.phone.x} ${p.phone.y}) rotate(${p.phone.rot}) scale(1.4)`}>
      <Phone face={p.phone.face} screen={screen} body={phoneColor} />
    </g>
  ) : null;

  const handR = <circle cx={p.r.x} cy={p.r.y} r={24} fill={look.skin} />;
  const handL = <circle cx={p.l.x} cy={p.l.y} r={24} fill={look.skin} />;

  return (
    <g transform={`translate(0 ${breathe})`}>
      {/* neck + torso */}
      <rect x={172} y={262} width={56} height={90} rx={20} fill={skinDark} />
      <path d="M92,760 Q86,420 140,360 Q200,330 260,360 Q314,420 308,760Z" fill={look.shirt} />
      {look.hair !== "hijab" && <path d="M170,352 Q200,392 230,352" stroke={look.accent ?? shirtDark} strokeWidth={10} fill="none" strokeLinecap="round" />}
      {look.hair === "hijab" && <path d="M70,420 Q200,470 330,420 Q300,520 200,540 Q100,520 70,420Z" fill={look.hairColor} />}
      {head}
      {/* arms over torso */}
      <path d={arm(SHOULDER_L, p.l, -50)} stroke={shirtDark} strokeWidth={50} fill="none" strokeLinecap="round" />
      <path d={arm(SHOULDER_R, p.r, 50)} stroke={shirtDark} strokeWidth={50} fill="none" strokeLinecap="round" />
      {/* phone between fingers: hands drawn after so fingers wrap it */}
      {phoneEl}
      {handL}
      {handR}
    </g>
  );
};
