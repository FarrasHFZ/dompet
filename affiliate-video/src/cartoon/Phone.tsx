import React from "react";

// Stylised iPhone 18 Pro Max, centred on (0,0), 74 x 152. The back follows the real design
// (full-width camera plateau, three lenses, flash); colour comes from the product variant.
// Screens are drawn, with no numbers or claims on them; facts stay in the narration where the guard checks them.

export type PhoneScreen = "lock" | "food" | "chat" | "camera" | "calendar" | "charging" | "map" | "videocall" | "music";

const W = 74;
const H = 152;

const Screen: React.FC<{ kind: PhoneScreen }> = ({ kind }) => {
  const x = -W / 2 + 4;
  const y = -H / 2 + 4;
  const w = W - 8;
  const h = H - 8;
  const clip = <clipPath id={`scr-${kind}`}><rect x={x} y={y} width={w} height={h} rx={12} /></clipPath>;
  const body = (() => {
    switch (kind) {
      case "food":
        return (
          <>
            <rect x={x} y={y} width={w} height={h} fill="#f3dcc0" />
            <circle cx={0} cy={6} r={26} fill="#fff" />
            <circle cx={0} cy={6} r={19} fill="#e7a24a" />
            <path d="M-14,0 q7,-6 14,0 t14,0 M-14,8 q7,-6 14,0 t14,0" stroke="#fff3c4" strokeWidth={3} fill="none" />
            <circle cx={8} cy={-2} r={4} fill="#d6402b" />
            <circle cx={-7} cy={12} r={3.5} fill="#5b9b3a" />
          </>
        );
      case "chat":
        return (
          <>
            <rect x={x} y={y} width={w} height={h} fill="#ece5dd" />
            <rect x={x + 5} y={y + 22} width={38} height={14} rx={7} fill="#fff" />
            <rect x={x + 22} y={y + 42} width={38} height={14} rx={7} fill="#d9fdd3" />
            <rect x={x + 5} y={y + 62} width={30} height={14} rx={7} fill="#fff" />
            <rect x={x + 18} y={y + 82} width={42} height={22} rx={7} fill="#d9fdd3" />
          </>
        );
      case "camera":
        return (
          <>
            <rect x={x} y={y} width={w} height={h} fill="#2b3a4a" />
            <rect x={x} y={y + 22} width={w} height={h - 52} fill="#7fb3d5" />
            <circle cx={-10} cy={-6} r={14} fill="#f6d365" />
            <path d={`M${x},${y + 82} q20,-18 33,-4 t33,-6 v20 h-66z`} fill="#4c8c4a" />
            <circle cx={0} cy={y + h - 15} r={9} fill="#fff" />
          </>
        );
      case "calendar":
        return (
          <>
            <rect x={x} y={y} width={w} height={h} fill="#fff" />
            <rect x={x} y={y} width={w} height={26} fill="#e74c3c" />
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={x + 6} y={y + 34 + i * 24} width={w - 12} height={16} rx={4} fill={["#cfe8ff", "#ffe2c6", "#d8f5d0", "#f3d1ff"][i]} />
            ))}
          </>
        );
      case "charging":
        return (
          <>
            <rect x={x} y={y} width={w} height={h} fill="#0d0d0d" />
            <rect x={-16} y={-26} width={32} height={54} rx={6} stroke="#fff" strokeWidth={3} fill="none" />
            <rect x={-6} y={-31} width={12} height={5} rx={2} fill="#fff" />
            <rect x={-12} y={0} width={24} height={24} rx={3} fill="#34c759" />
            <path d="M3,-18 l-9,16 h7 l-4,14 l11,-18 h-7z" fill="#fff" />
          </>
        );
      case "map":
        return (
          <>
            <rect x={x} y={y} width={w} height={h} fill="#eef3e2" />
            <path d={`M${x},${y + 40} L${x + w},${y + 70} M${x + 20},${y} L${x + 40},${y + h}`} stroke="#fff" strokeWidth={7} />
            <path d={`M${x + 10},${y + 110} q20,-40 50,-70`} stroke="#3478f6" strokeWidth={4} fill="none" />
            <circle cx={x + 60} cy={y + 40} r={5} fill="#e74c3c" />
          </>
        );
      case "videocall":
        return (
          <>
            <rect x={x} y={y} width={w} height={h} fill="#c9a27e" />
            <circle cx={0} cy={-14} r={16} fill="#8a5a3a" />
            <rect x={-22} y={4} width={44} height={40} rx={18} fill="#3d6e9e" />
            <rect x={x + w - 22} y={y + 8} width={16} height={24} rx={4} fill="#556" />
            <circle cx={0} cy={y + h - 14} r={7} fill="#ff3b30" />
          </>
        );
      case "music":
        return (
          <>
            <rect x={x} y={y} width={w} height={h} fill="#1e1530" />
            <rect x={x + 8} y={y + 18} width={w - 16} height={w - 16} rx={6} fill="#c0577a" />
            <rect x={x + 8} y={y + 90} width={w - 16} height={4} rx={2} fill="#555" />
            <rect x={x + 8} y={y + 90} width={30} height={4} rx={2} fill="#fff" />
          </>
        );
      default:
        // lock screen: the layered wave wallpaper from the product photos
        return (
          <>
            <rect x={x} y={y} width={w} height={h} fill="#3a1018" />
            {[0, 1, 2, 3].map((i) => (
              <path key={i} d={`M${x},${y + 30 + i * 30} q${w / 2},-24 ${w},0`} stroke="#c56a7a" strokeOpacity={0.5 - i * 0.08} strokeWidth={7} fill="none" />
            ))}
          </>
        );
    }
  })();
  return (
    <>
      <defs>{clip}</defs>
      <g clipPath={`url(#scr-${kind})`}>{body}</g>
    </>
  );
};

export const Phone: React.FC<{ face: "front" | "back"; screen: PhoneScreen; body: string }> = ({ face, screen, body }) => {
  if (face === "front") {
    return (
      <g>
        <rect x={-W / 2 - 2} y={-H / 2 - 2} width={W + 4} height={H + 4} rx={18} fill={body} />
        <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={16} fill="#0b0b0b" />
        <Screen kind={screen} />
        <rect x={-11} y={-H / 2 + 8} width={22} height={7} rx={3.5} fill="#000" />
      </g>
    );
  }
  return (
    <g>
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={16} fill={body} />
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={16} fill="url(#sheen)" opacity={0.35} />
      <defs>
        <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* full-width camera plateau */}
      <rect x={-W / 2 + 3} y={-H / 2 + 4} width={W - 6} height={48} rx={13} fill="#000" opacity={0.18} />
      {[
        [-20, -58],
        [-20, -34],
        [1, -46],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={10} fill="#1a1a1a" stroke="#00000055" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={5} fill="#2c3550" />
          <circle cx={cx + 2} cy={cy - 2} r={1.6} fill="#9fb3ff" />
        </g>
      ))}
      <circle cx={22} cy={-60} r={4} fill="#fff6d0" />
      <circle cx={0} cy={18} r={8} fill="#000" opacity={0.12} />
    </g>
  );
};
