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
