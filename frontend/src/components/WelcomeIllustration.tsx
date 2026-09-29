/**
 * Original onboarding illustration: two budget cards, a receipt, a coin stack and a
 * category donut, drawn as flat outlined shapes. Decorative only (aria-hidden).
 */
const INK = "#121212";
const STROKE = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Sparkle({ x, y, size = 10 }: { x: number; y: number; size?: number }) {
  const s = size;
  return (
    <path
      d={`M${x} ${y - s} C${x + s * 0.15} ${y - s * 0.15} ${x + s * 0.15} ${y - s * 0.15} ${x + s} ${y} C${x + s * 0.15} ${y + s * 0.15} ${x + s * 0.15} ${y + s * 0.15} ${x} ${y + s} C${x - s * 0.15} ${y + s * 0.15} ${x - s * 0.15} ${y + s * 0.15} ${x - s} ${y} C${x - s * 0.15} ${y - s * 0.15} ${x - s * 0.15} ${y - s * 0.15} ${x} ${y - s}Z`}
      fill="#fbfaf6"
      {...STROKE}
      strokeWidth={2}
    />
  );
}

export function WelcomeIllustration({ className = "" }: { className?: string }) {
  const donutR = 21;
  const donutC = 2 * Math.PI * donutR;
  return (
    <svg viewBox="0 0 340 300" className={className} aria-hidden="true" focusable="false">
      <ellipse cx="176" cy="280" rx="128" ry="10" fill={INK} opacity="0.08" />

      {/* Receipt */}
      <g className="bf-float" style={{ animationDelay: "0.6s" }}>
        <path
          d="M28 104 h62 a6 6 0 0 1 6 6 v112 l-8 -7 -8 7 -8 -7 -8 7 -8 -7 -8 7 -8 -7 -8 7 v-115 a6 6 0 0 1 6 -6z"
          fill="#fbfaf6"
          {...STROKE}
          transform="rotate(-8 62 160)"
        />
        <g transform="rotate(-8 62 160)" {...STROKE} strokeWidth={2.2}>
          <circle cx="47" cy="128" r="8" fill="var(--pastel-blush, #fbd9df)" />
          <line x1="62" y1="124" x2="84" y2="124" />
          <line x1="62" y1="133" x2="76" y2="133" />
          <line x1="40" y1="152" x2="84" y2="152" />
          <line x1="40" y1="164" x2="72" y2="164" />
          <line x1="40" y1="176" x2="80" y2="176" />
          <line x1="40" y1="194" x2="84" y2="194" strokeWidth={3} />
        </g>
      </g>

      {/* Back card: lavender */}
      <g className="bf-float" style={{ animationDelay: "0.2s" }}>
        <g transform="rotate(-11 170 125)">
          <rect x="78" y="66" width="188" height="118" rx="18" fill="var(--pastel-lavender, #dcd7fb)" {...STROKE} />
          <rect x="98" y="92" width="32" height="24" rx="6" fill="var(--pastel-yellow, #fbf1b4)" {...STROKE} strokeWidth={2.2} />
          <line x1="98" y1="104" x2="130" y2="104" {...STROKE} strokeWidth={1.8} />
          <line x1="114" y1="92" x2="114" y2="116" {...STROKE} strokeWidth={1.8} />
          <line x1="98" y1="150" x2="150" y2="150" {...STROKE} strokeWidth={3} />
          <line x1="98" y1="162" x2="128" y2="162" {...STROKE} strokeWidth={3} />
          <circle cx="226" cy="154" r="12" fill={INK} />
          <circle cx="242" cy="154" r="12" fill="#fbfaf6" {...STROKE} />
        </g>
      </g>

      {/* Front card: lime, with a rising bar chart and a check */}
      <g className="bf-float">
        <g transform="rotate(6 196 196)">
          <rect x="102" y="138" width="190" height="120" rx="18" fill="var(--pastel-lime, #dff47c)" {...STROKE} />
          <rect x="122" y="158" width="64" height="18" rx="9" fill="#fbfaf6" {...STROKE} strokeWidth={2} />
          <line x1="132" y1="167" x2="170" y2="167" {...STROKE} strokeWidth={2.5} />
          <g fill={INK}>
            <rect x="126" y="220" width="16" height="20" rx="4" />
            <rect x="150" y="208" width="16" height="32" rx="4" />
            <rect x="174" y="196" width="16" height="44" rx="4" />
            <rect x="198" y="186" width="16" height="54" rx="4" />
          </g>
          <circle cx="256" cy="172" r="17" fill={INK} />
          <path d="M248 172 l6 6 l11 -12" fill="none" stroke="var(--pastel-lime, #dff47c)" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>

      {/* Category donut badge */}
      <g className="bf-float" style={{ animationDelay: "0.9s" }}>
        <circle cx="286" cy="70" r="34" fill="#fbfaf6" {...STROKE} />
        <g transform="rotate(-90 286 70)" fill="none" strokeWidth={11}>
          <circle cx="286" cy="70" r={donutR} stroke="var(--pastel-blush, #fbd9df)" strokeDasharray={`${donutC * 0.42} ${donutC}`} />
          <circle cx="286" cy="70" r={donutR} stroke="var(--pastel-blue, #d3e7fb)" strokeDasharray={`${donutC * 0.3} ${donutC}`} strokeDashoffset={-donutC * 0.42} />
          <circle cx="286" cy="70" r={donutR} stroke="var(--pastel-lime, #dff47c)" strokeDasharray={`${donutC * 0.28} ${donutC}`} strokeDashoffset={-donutC * 0.72} />
        </g>
        <circle cx="286" cy="70" r={donutR + 5.5} fill="none" {...STROKE} strokeWidth={2} />
        <circle cx="286" cy="70" r={donutR - 5.5} fill="#fbfaf6" {...STROKE} strokeWidth={2} />
      </g>

      {/* Coin stack */}
      <g className="bf-float" style={{ animationDelay: "1.2s" }} {...STROKE}>
        <path d="M34 262 v-10 a22 8 0 0 1 44 0 v10 a22 8 0 0 1 -44 0z" fill="var(--pastel-yellow, #fbf1b4)" />
        <path d="M34 250 v-10 a22 8 0 0 1 44 0 v10" fill="var(--pastel-yellow, #fbf1b4)" />
        <ellipse cx="56" cy="240" rx="22" ry="8" fill="#fff8d6" />
        <path d="M34 250 a22 8 0 0 0 44 0" fill="none" />
      </g>

      <Sparkle x={170} y={30} size={11} />
      <Sparkle x={44} y={70} size={8} />
      <Sparkle x={318} y={178} size={9} />
    </svg>
  );
}
