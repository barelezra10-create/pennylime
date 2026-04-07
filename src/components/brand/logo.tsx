interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  textClassName?: string;
}

/**
 * PennyLime brand mark: a penny coin with lime cross-section inside.
 * Copper coin rim + green lime segments = money meets fresh.
 */
export function LogoMark({ className = "", size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Coin rim gradient, copper/bronze 3D */}
        <linearGradient id="coin-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8a54b" />
          <stop offset="30%" stopColor="#d4883a" />
          <stop offset="60%" stopColor="#c47a2e" />
          <stop offset="100%" stopColor="#a0611e" />
        </linearGradient>
        {/* Inner coin face */}
        <radialGradient id="coin-face" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#f5d08e" />
          <stop offset="50%" stopColor="#e8b860" />
          <stop offset="100%" stopColor="#c9903a" />
        </radialGradient>
        {/* Lime pulp */}
        <radialGradient id="lime-fill" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#bbf7d0" />
          <stop offset="50%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </radialGradient>
        {/* Glossy coin highlight */}
        <radialGradient id="coin-gloss" cx="30%" cy="25%" r="40%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Drop shadow */}
      <ellipse cx="24" cy="43" rx="16" ry="2.5" fill="#000" opacity="0.1" />

      {/* Outer coin rim, copper */}
      <circle cx="24" cy="22" r="21" fill="url(#coin-rim)" />

      {/* Inner coin face, gold */}
      <circle cx="24" cy="22" r="18" fill="url(#coin-face)" />

      {/* Raised inner edge, coin detail */}
      <circle cx="24" cy="22" r="17" fill="none" stroke="#c9903a" strokeWidth="0.8" />

      {/* Small dots around the rim like a real penny */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
        const r = 19.5;
        const x = 24 + r * Math.cos((angle * Math.PI) / 180);
        const y = 22 + r * Math.sin((angle * Math.PI) / 180);
        return <circle key={angle} cx={x} cy={y} r="0.6" fill="#a0611e" opacity="0.6" />;
      })}

      {/* ─── Lime cross-section in the center ─── */}

      {/* Lime outer rind ring */}
      <circle cx="24" cy="22" r="12" fill="#15803d" />

      {/* Lime pith (white ring) */}
      <circle cx="24" cy="22" r="10.5" fill="#dcfce7" />

      {/* Lime pulp */}
      <circle cx="24" cy="22" r="9.5" fill="url(#lime-fill)" />

      {/* Segment dividers, thin white lines from center */}
      <g stroke="#dcfce7" strokeWidth="1.2" strokeLinecap="round">
        <line x1="24" y1="22" x2="24" y2="12.5" />
        <line x1="24" y1="22" x2="32.2" y2="17.25" />
        <line x1="24" y1="22" x2="32.2" y2="26.75" />
        <line x1="24" y1="22" x2="24" y2="31.5" />
        <line x1="24" y1="22" x2="15.8" y2="26.75" />
        <line x1="24" y1="22" x2="15.8" y2="17.25" />
      </g>

      {/* Segment juice cell dots */}
      <g fill="#bbf7d0" opacity="0.7">
        <circle cx="26.5" cy="16" r="0.5" />
        <circle cx="29" cy="20" r="0.5" />
        <circle cx="29" cy="24" r="0.5" />
        <circle cx="26.5" cy="28" r="0.5" />
        <circle cx="21.5" cy="28" r="0.5" />
        <circle cx="19" cy="24" r="0.5" />
        <circle cx="19" cy="20" r="0.5" />
        <circle cx="21.5" cy="16" r="0.5" />
      </g>

      {/* Center pith dot */}
      <circle cx="24" cy="22" r="1.2" fill="#dcfce7" />

      {/* Glossy highlight over the whole coin */}
      <ellipse cx="18" cy="14" rx="8" ry="5" fill="url(#coin-gloss)" />

      {/* ¢ symbol, tiny, bottom right of coin */}
      <text x="33" y="32" fill="#a0611e" fontSize="7" fontWeight="bold" fontFamily="serif" opacity="0.5">¢</text>
    </svg>
  );
}

export function Logo({
  className = "",
  size = 32,
  showText = true,
  textClassName = "font-extrabold text-[15px] tracking-[-0.03em]",
}: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <span className={textClassName}>
          Penny<span className="text-[#15803d]">Lime</span>
        </span>
      )}
    </span>
  );
}
