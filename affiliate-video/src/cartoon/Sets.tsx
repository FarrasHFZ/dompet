import React from "react";

// Hand-drawn 1080 x 1920 sets. Each set has a back layer (behind characters) and a front layer
// (table / blanket / handrail in front of them), so people sit "in" the scene.

export type SetName = "bedroom" | "commute" | "cafe" | "night" | "desk" | "street";

const Window: React.FC<{ x: number; y: number; w: number; h: number; sky: [string, string]; children?: React.ReactNode }> = ({ x, y, w, h, sky, children }) => (
  <g>
    <defs>
      <linearGradient id={`sky${x}${y}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={sky[0]} />
        <stop offset="1" stopColor={sky[1]} />
      </linearGradient>
      <clipPath id={`win${x}${y}`}><rect x={x} y={y} width={w} height={h} rx={16} /></clipPath>
    </defs>
    <rect x={x - 14} y={y - 14} width={w + 28} height={h + 28} rx={22} fill="#ffffff" opacity={0.85} />
    <g clipPath={`url(#win${x}${y})`}>
      <rect x={x} y={y} width={w} height={h} fill={`url(#sky${x}${y})`} />
      {children}
    </g>
    <rect x={x + w / 2 - 5} y={y} width={10} height={h} fill="#ffffff" opacity={0.85} />
  </g>
);

const City: React.FC<{ x: number; y: number; w: number; base: number; color: string; shift?: number; lit?: boolean }> = ({ x, y, w, base, color, shift = 0, lit }) => {
  const blocks = [];
  for (let i = -2; i < 14; i++) {
    const bx = x + ((i * 120 + shift) % (w + 240)) - 120;
    const bh = 160 + ((i * 73) % 5) * 60;
    blocks.push(
      <g key={i}>
        <rect x={bx} y={base - bh} width={100} height={bh} fill={color} />
        {lit && [0, 1, 2, 3].map((r) => <rect key={r} x={bx + 18 + (r % 2) * 40} y={base - bh + 30 + Math.floor(r / 2) * 50} width={18} height={22} fill="#ffd27a" opacity={0.8} />)}
      </g>,
    );
  }
  return <g>{blocks}</g>;
};

export const SetBack: React.FC<{ name: SetName; frame: number }> = ({ name, frame }) => {
  switch (name) {
    case "bedroom":
      return (
        <g>
          <rect width={1080} height={1920} fill="#dfe6f1" />
          <Window x={600} y={260} w={380} h={460} sky={["#ffd9a8", "#ffb4a2"]}>
            <circle cx={790} cy={640} r={90} fill="#fff1c9" />
            <City x={600} y={260} w={380} base={720} color="#e9a48f" />
          </Window>
          {/* light beam */}
          <path d="M600,720 L980,720 L760,1500 L120,1500Z" fill="#fff3d6" opacity={0.35} />
          {/* headboard + pillows */}
          <rect x={20} y={760} width={1040} height={700} rx={60} fill="#9fb4d6" />
          <rect x={60} y={980} width={420} height={200} rx={90} fill="#ffffff" />
          <rect x={600} y={980} width={420} height={200} rx={90} fill="#f4f6fb" />
          {/* nightstand + lamp */}
          <rect x={40} y={560} width={60} height={200} rx={10} fill="#c9a27e" />
          <path d="M10,560 L130,560 L105,470 L35,470Z" fill="#ffe7a8" />
        </g>
      );
    case "commute": {
      const shift = -(frame * 9) % 1200;
      return (
        <g>
          <rect width={1080} height={1920} fill="#cfd8dc" />
          <Window x={60} y={300} w={960} h={460} sky={["#a7d3f5", "#e3f2fd"]}>
            <City x={60} y={300} w={960} base={760} color="#8fa9bb" shift={shift} />
            <City x={60} y={300} w={960} base={760} color="#6d8799" shift={shift * 1.6 + 60} />
          </Window>
          <rect x={0} y={150} width={1080} height={40} fill="#ef6c00" />
          <rect x={0} y={800} width={1080} height={1120} fill="#b0bec5" />
          {/* seat backs */}
          <rect x={30} y={1050} width={300} height={260} rx={40} fill="#1565c0" />
          <rect x={750} y={1050} width={300} height={260} rx={40} fill="#1565c0" />
          {/* pole */}
          <rect x={520} y={0} width={28} height={1920} fill="#eceff1" />
        </g>
      );
    }
    case "night":
      return (
        <g>
          <rect width={1080} height={1920} fill="#151a33" />
          <City x={0} y={0} w={1080} base={1050} color="#232a4d" lit />
          {Array.from({ length: 14 }).map((_, i) => (
            <g key={i}>
              <circle cx={40 + i * 76} cy={260 + Math.sin(i) * 40} r={14} fill="#ffd27a" opacity={0.6 + 0.4 * Math.sin(frame / 10 + i)} />
              <circle cx={40 + i * 76} cy={260 + Math.sin(i) * 40} r={34} fill="#ffd27a" opacity={0.12} />
            </g>
          ))}
          <path d="M0,240 Q270,330 540,250 T1080,260" stroke="#3b3f5c" strokeWidth={4} fill="none" />
        </g>
      );
    case "desk":
      return (
        <g>
          <rect width={1080} height={1920} fill="#eef0e8" />
          <Window x={80} y={240} w={420} h={520} sky={["#bfe3ff", "#eaf6ff"]}>
            <City x={80} y={240} w={420} base={760} color="#b6c6d6" />
          </Window>
          <rect x={620} y={300} width={360} height={240} rx={18} fill="#2b2b2b" />
          <rect x={636} y={316} width={328} height={200} rx={8} fill="#7aa5d6" />
          <rect x={770} y={540} width={60} height={90} fill="#2b2b2b" />
          {/* plant */}
          <rect x={930} y={620} width={90} height={120} rx={14} fill="#c46b4a" />
          <ellipse cx={975} cy={600} rx={70} ry={60} fill="#4caf50" />
        </g>
      );
    case "street":
      return (
        <g>
          <rect width={1080} height={1920} fill="#ffe0b2" />
          <City x={0} y={0} w={1080} base={1000} color="#ffcc80" />
          <rect x={0} y={1000} width={1080} height={920} fill="#bcaaa4" />
          {/* street food cart */}
          <rect x={640} y={780} width={380} height={240} rx={20} fill="#d84315" />
          <rect x={620} y={740} width={420} height={60} rx={20} fill="#ffeb3b" />
        </g>
      );
    default:
      // cafe
      return (
        <g>
          <rect width={1080} height={1920} fill="#f3e3cf" />
          <rect x={0} y={900} width={1080} height={1020} fill="#d9b48f" />
          <Window x={90} y={250} w={900} h={520} sky={["#cfe9ff", "#f6fbff"]}>
            <City x={90} y={250} w={900} base={770} color="#c7d6e3" />
            <ellipse cx={300} cy={760} rx={260} ry={60} fill="#a5d6a7" />
          </Window>
          {/* pendant lamps */}
          {[260, 820].map((x) => (
            <g key={x}>
              <rect x={x - 2} y={0} width={4} height={150} fill="#333" />
              <path d={`M${x - 60},210 Q${x},120 ${x + 60},210Z`} fill="#2e2e2e" />
              <ellipse cx={x} cy={214} rx={30} ry={10} fill="#ffe7a8" />
            </g>
          ))}
          {/* plant */}
          <rect x={960} y={760} width={90} height={150} rx={14} fill="#c46b4a" />
          <ellipse cx={1005} cy={730} rx={80} ry={90} fill="#5a9e5c" />
        </g>
      );
  }
};

export const SetFront: React.FC<{ name: SetName; frame: number }> = ({ name }) => {
  switch (name) {
    case "bedroom":
      return (
        <g>
          <path d="M0,1380 Q540,1300 1080,1380 L1080,1920 L0,1920Z" fill="#f7c9b6" />
          <path d="M0,1380 Q540,1300 1080,1380" stroke="#e9a48f" strokeWidth={14} fill="none" />
        </g>
      );
    case "commute":
      return <rect x={0} y={1380} width={1080} height={540} fill="#90a4ae" />;
    case "night":
      return (
        <g>
          <rect x={0} y={1300} width={1080} height={620} fill="#3e2723" />
          <rect x={0} y={1300} width={1080} height={22} fill="#5d4037" />
          <rect x={430} y={1220} width={70} height={90} rx={10} fill="#ffb74d" opacity={0.9} />
          <rect x={580} y={1230} width={60} height={80} rx={10} fill="#e57373" opacity={0.9} />
        </g>
      );
    case "desk":
      return (
        <g>
          <rect x={0} y={1320} width={1080} height={600} fill="#a1887f" />
          <rect x={0} y={1320} width={1080} height={22} fill="#bcaaa4" />
          <rect x={720} y={1250} width={90} height={80} rx={12} fill="#fff" />
        </g>
      );
    case "street":
      return <rect x={0} y={1380} width={1080} height={540} fill="#8d6e63" />;
    default:
      return (
        <g>
          <rect x={0} y={1300} width={1080} height={620} fill="#8b5a3c" />
          <rect x={0} y={1300} width={1080} height={24} fill="#a8734f" />
          {/* coffee cups */}
          <rect x={430} y={1220} width={80} height={90} rx={12} fill="#fff" />
          <ellipse cx={470} cy={1222} rx={40} ry={10} fill="#6d4c41" />
          <rect x={590} y={1230} width={70} height={80} rx={12} fill="#fff" />
          <ellipse cx={625} cy={1232} rx={35} ry={9} fill="#a1887f" />
        </g>
      );
  }
};
