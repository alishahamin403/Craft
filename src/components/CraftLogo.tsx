export default function CraftLogo({ size = 32 }: { size?: number }) {
  const textSize = size * 0.72;

  // Three frames stacked top-left → bottom-right.
  // Back frames peek out from top-left; front frame is solid bottom-right.
  // Frame size + 2 offsets fill the viewBox exactly.
  const fw = size * 0.69;
  const fh = size * 0.69;
  const rx = size * 0.16;
  const step = size * 0.155;
  const sw = size * 0.055; // stroke width for back frames

  // Back frame: top-left; front frame: bottom-right
  const bx = 0;      const by = 0;
  const mx = step;   const my = step;
  const fx = step*2; const fy = step*2;

  // Play triangle centred in front frame
  const cx = fx + fw / 2 + fw * 0.03;
  const cy = fy + fh / 2;
  const tw = fw * 0.27;
  const th = fh * 0.31;
  const play = `M${cx - tw*0.42},${cy - th/2} L${cx - tw*0.42},${cy + th/2} L${cx + tw*0.58},${cy} Z`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Back frame — stroke only, clearly peeking from top-left */}
        <rect x={bx} y={by} width={fw} height={fh} rx={rx}
          fill="var(--accent)" fillOpacity="0.18"
          stroke="var(--accent)" strokeWidth={sw} strokeOpacity="0.55"
        />
        {/* Middle frame */}
        <rect x={mx} y={my} width={fw} height={fh} rx={rx}
          fill="var(--accent)" fillOpacity="0.5"
        />
        {/* Front frame — solid accent */}
        <rect x={fx} y={fy} width={fw} height={fh} rx={rx}
          fill="var(--accent)"
        />
        {/* Play triangle */}
        <path d={play} fill="white" />
      </svg>

      <span
        style={{
          fontSize: textSize,
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        Craft
      </span>
    </div>
  );
}
