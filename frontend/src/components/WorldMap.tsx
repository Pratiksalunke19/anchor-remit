/**
 * Decorative cartographic backdrop — stylised world dots + routed amber arc
 * between two pins. Pure SVG, no external assets, very low visual weight so it
 * reads as texture rather than illustration.
 */
export default function WorldMap({
  className = "",
  showRoute = true,
}: {
  className?: string;
  showRoute?: boolean;
}) {
  // Hand-curated dot grid that suggests continents without literal geography.
  // Coordinates are within an 800x360 viewBox.
  const dots: [number, number, number?][] = [
    // Americas
    [80, 110], [96, 130], [112, 152], [128, 175], [110, 195], [128, 215],
    [144, 200], [150, 230], [160, 260], [175, 285],
    [70, 145], [88, 165], [104, 188],
    // Europe
    [330, 95], [350, 110], [368, 100], [385, 118], [342, 130], [360, 145],
    [375, 132], [392, 138],
    // Africa
    [355, 175], [370, 200], [385, 225], [395, 252], [380, 275],
    [340, 195], [355, 220], [368, 245],
    // Middle East / Central Asia
    [430, 130], [448, 145], [462, 160], [478, 138],
    // South & SE Asia
    [510, 178], [528, 195], [542, 210], [560, 225], [580, 240],
    [495, 200], [515, 215],
    // East Asia
    [580, 130], [600, 145], [618, 132], [635, 150], [612, 168],
    // Oceania
    [630, 270], [650, 285], [668, 268], [688, 292],
  ];

  // Route start/end (in same viewBox space) — Americas → SE Asia
  const start = { x: 130, y: 200 };
  const end = { x: 555, y: 218 };
  // Cubic curve control points lifted upward → arc shape
  const c1 = { x: 270, y: 40 };
  const c2 = { x: 410, y: 50 };

  const path = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;

  return (
    <svg
      viewBox="0 0 800 360"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <linearGradient id="ar-route" x1="0" x2="1">
          <stop offset="0" stopColor="#A8F060" stopOpacity="0" />
          <stop offset="0.2" stopColor="#A8F060" stopOpacity="0.85" />
          <stop offset="0.8" stopColor="#C5F58E" stopOpacity="0.9" />
          <stop offset="1" stopColor="#C5F58E" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ar-pin" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#C5F58E" />
          <stop offset="1" stopColor="#6FB52E" />
        </radialGradient>
      </defs>

      {/* dot field */}
      <g fill="rgba(244,236,221,0.18)">
        {dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.6} />
        ))}
      </g>

      {showRoute && (
        <>
          {/* faint underlay path */}
          <path
            d={path}
            fill="none"
            stroke="rgba(244,236,221,0.10)"
            strokeWidth={1.2}
          />
          {/* amber arc */}
          <path
            d={path}
            fill="none"
            stroke="url(#ar-route)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeDasharray="2 6"
          />

          {/* origin pin */}
          <g transform={`translate(${start.x} ${start.y})`}>
            <circle r={9} fill="rgba(217,162,78,0.18)" />
            <circle r={4.5} fill="url(#ar-pin)" />
          </g>
          {/* destination pin */}
          <g transform={`translate(${end.x} ${end.y})`}>
            <circle r={11} fill="rgba(168,240,96,0.18)" />
            <circle r={5} fill="#A8F060" />
            <circle r={2} fill="#0C0C0D" />
          </g>
        </>
      )}
    </svg>
  );
}
