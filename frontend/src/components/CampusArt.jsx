// Decorative campus illustrations (pure SVG, no image assets).

function Windows({ x, y, cols, rows, w = 7, h = 9, gapX = 4, gapY = 6, fill }) {
  const rects = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      rects.push(<rect key={`${r}-${c}`} x={x + c * (w + gapX)} y={y + r * (h + gapY)} width={w} height={h} rx={1} fill={fill} />);
    }
  }
  return <g>{rects}</g>;
}

function Tree({ x, y, r = 12, fill = '#cfe0fb', trunk = '#b6cdf5' }) {
  return (
    <g>
      <rect x={x - 1.5} y={y} width={3} height={r * 1.1} fill={trunk} />
      <circle cx={x} cy={y - r * 0.2} r={r} fill={fill} />
      <circle cx={x - r * 0.6} cy={y + r * 0.2} r={r * 0.7} fill={fill} />
      <circle cx={x + r * 0.6} cy={y + r * 0.25} r={r * 0.7} fill={fill} />
    </g>
  );
}

/** Pale blue campus skyline used at the bottom of the sidebar. */
export default function CampusArt({ className }) {
  return (
    <svg className={className} viewBox="0 0 256 170" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <linearGradient id="campusFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e3edfd" stopOpacity="0" />
          <stop offset="100%" stopColor="#dbe7fb" />
        </linearGradient>
      </defs>
      <rect x="0" y="60" width="256" height="110" fill="url(#campusFade)" />
      {/* flags */}
      <line x1="60" y1="18" x2="60" y2="60" stroke="#c3d6f7" strokeWidth="1.5" />
      <path d="M60 18h14l-3 4 3 4H60z" fill="#c3d6f7" />
      <line x1="140" y1="8" x2="140" y2="46" stroke="#c3d6f7" strokeWidth="1.5" />
      <path d="M140 8h14l-3 4 3 4h-14z" fill="#c3d6f7" />
      {/* buildings */}
      <rect x="18" y="72" width="70" height="80" fill="#d7e5fb" />
      <Windows x={24} y={80} cols={6} rows={4} fill="#eef4fe" />
      <rect x="84" y="46" width="96" height="106" fill="#cddffa" />
      <path d="M80 50 132 30l52 20z" fill="#c1d6f7" />
      <Windows x={92} y={58} cols={8} rows={5} fill="#eaf1fd" />
      <rect x="120" y="126" width="24" height="26" fill="#eaf1fd" />
      <rect x="176" y="80" width="60" height="72" fill="#d7e5fb" />
      <Windows x={182} y={88} cols={5} rows={4} fill="#eef4fe" />
      {/* trees */}
      <Tree x={14} y={138} r={11} />
      <Tree x={70} y={140} r={10} />
      <Tree x={196} y={140} r={11} />
      <Tree x={242} y={136} r={12} />
      <rect x="0" y="150" width="256" height="20" fill="#d3e2fa" />
      <path d="M0 158c60-6 120-6 256 0v12H0z" fill="#c9dbf8" />
    </svg>
  );
}

/** Modern glass campus building for the dashboard welcome banner. */
export function BannerBuilding({ className }) {
  return (
    <svg className={className} viewBox="0 0 640 180" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="bbSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bcd7fb" />
          <stop offset="100%" stopColor="#e8f1fd" />
        </linearGradient>
        <linearGradient id="bbGlass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5d8fd6" />
          <stop offset="100%" stopColor="#2f5fa8" />
        </linearGradient>
        <linearGradient id="bbGlassLight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9cc0ef" />
          <stop offset="100%" stopColor="#5f8fd0" />
        </linearGradient>
        <linearGradient id="bbFadeLeft" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#eef5ff" stopOpacity="1" />
          <stop offset="35%" stopColor="#eef5ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="640" height="180" fill="url(#bbSky)" />
      <ellipse cx="420" cy="40" rx="90" ry="18" fill="#fff" opacity="0.55" />
      <ellipse cx="560" cy="26" rx="60" ry="12" fill="#fff" opacity="0.5" />

      {/* left wing */}
      <path d="M250 70 380 58v122H250z" fill="#e4ebf5" />
      <path d="M250 70 380 58v8L250 78z" fill="#f7f9fc" />
      {Array.from({ length: 5 }, (_, r) => (
        <path key={r} d={`M256 ${88 + r * 17} 374 ${78 + r * 17}v10L256 ${98 + r * 17}z`} fill="url(#bbGlassLight)" opacity="0.9" />
      ))}

      {/* main tower */}
      <path d="M380 30 540 16v164H380z" fill="#f1f4f9" />
      <path d="M380 30 540 16v10L380 40z" fill="#ffffff" />
      {Array.from({ length: 7 }, (_, r) => (
        <g key={r}>
          <path d={`M388 ${50 + r * 18} 532 ${37 + r * 18}v12L388 ${62 + r * 18}z`} fill="url(#bbGlass)" />
          {Array.from({ length: 8 }, (_, c) => (
            <line
              key={c}
              x1={388 + (c + 1) * 16}
              y1={50 + r * 18 - (c + 1) * 1.45}
              x2={388 + (c + 1) * 16}
              y2={62 + r * 18 - (c + 1) * 1.45}
              stroke="#dfe8f5"
              strokeWidth="1.2"
            />
          ))}
        </g>
      ))}

      {/* right block */}
      <path d="M540 16 640 30v150H540z" fill="#d6dfeb" />
      {Array.from({ length: 7 }, (_, r) => (
        <path key={r} d={`M548 ${36 + r * 18} 632 ${47 + r * 18}v11L548 ${48 + r * 18}z`} fill="url(#bbGlassLight)" opacity="0.85" />
      ))}

      {/* entrance + ground */}
      <rect x="430" y="160" width="60" height="20" fill="#8fb1de" />
      <rect x="0" y="170" width="640" height="10" fill="#c9d8ea" />

      {/* trees */}
      <Tree x={236} y={150} r={20} fill="#3f8f5a" trunk="#6b5a45" />
      <Tree x={272} y={158} r={14} fill="#57a86b" trunk="#6b5a45" />
      <Tree x={372} y={160} r={13} fill="#4c9a61" trunk="#6b5a45" />
      <Tree x={520} y={158} r={14} fill="#57a86b" trunk="#6b5a45" />
      <Tree x={604} y={120} r={34} fill="#3a8452" trunk="#6b5a45" />
      <Tree x={630} y={60} r={30} fill="#46965d" trunk="#6b5a45" />

      <rect width="640" height="180" fill="url(#bbFadeLeft)" />
    </svg>
  );
}
