import { motion } from "framer-motion";

type Props = {
  /** ratio in percent (e.g. 180 for 180%) */
  ratio: number;
};

export default function CollateralMeter({ ratio }: Props) {
  const clamped = Math.min(Math.max(ratio, 0), 250);
  const pct = clamped / 250;
  const angle = -90 + pct * 180;

  const color =
    ratio >= 150 ? "#2ED573" : ratio >= 120 ? "#FFA502" : "#FF4757";

  const status =
    ratio >= 150 ? "Safe" : ratio >= 120 ? "Warning" : "Danger";

  return (
    <div className="relative w-full max-w-xs mx-auto">
      <svg viewBox="0 0 200 120" className="w-full">
        <defs>
          <linearGradient id="gauge" x1="0" x2="1">
            <stop offset="0" stopColor="#FF4757" />
            <stop offset="0.4" stopColor="#FFA502" />
            <stop offset="0.7" stopColor="#2ED573" />
          </linearGradient>
        </defs>
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          stroke="url(#gauge)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="251.3"
          strokeDashoffset={251.3 - pct * 251.3}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
        {/* threshold markers */}
        <Marker angle={-90 + (110 / 250) * 180} label="110%" />
        <Marker angle={-90 + (150 / 250) * 180} label="150%" />
        <motion.g
          initial={false}
          animate={{ rotate: angle }}
          style={{ originX: "100px", originY: "100px" }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        >
          <line x1="100" y1="100" x2="100" y2="30" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill={color} />
        </motion.g>
      </svg>
      <div className="text-center -mt-4">
        <div className="text-3xl font-bold" style={{ color }}>
          {ratio.toFixed(1)}%
        </div>
        <div className="text-sm text-white/60">Collateral · {status}</div>
      </div>
    </div>
  );
}

function Marker({ angle, label }: { angle: number; label: string }) {
  const r = 80;
  const rad = (angle * Math.PI) / 180;
  const x = 100 + Math.cos(rad) * r;
  const y = 100 + Math.sin(rad) * r;
  return (
    <g>
      <circle cx={x} cy={y} r="3" fill="rgba(255,255,255,0.35)" />
      <text
        x={x}
        y={y - 6}
        textAnchor="middle"
        fontSize="8"
        fill="rgba(255,255,255,0.5)"
      >
        {label}
      </text>
    </g>
  );
}
