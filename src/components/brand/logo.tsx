interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  textClassName?: string;
}

/**
 * PennyLime brand mark: a fresh lime slice.
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
        <radialGradient id="lime-rind" cx="45%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="70%" stopColor="#15803d" />
          <stop offset="100%" stopColor="#166534" />
        </radialGradient>
        <radialGradient id="lime-flesh" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#dcfce7" />
          <stop offset="40%" stopColor="#bbf7d0" />
          <stop offset="100%" stopColor="#86efac" />
        </radialGradient>
        <radialGradient id="lime-gloss" cx="30%" cy="25%" r="35%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="24" cy="44" rx="15" ry="2" fill="#000" opacity="0.08" />

      {/* Outer rind */}
      <circle cx="24" cy="22" r="20" fill="url(#lime-rind)" />

      {/* Pith ring */}
      <circle cx="24" cy="22" r="17" fill="#f0fdf4" />

      {/* Inner flesh */}
      <circle cx="24" cy="22" r="15.5" fill="url(#lime-flesh)" />

      {/* Segments - 6 dividers from center */}
      <g stroke="#f0fdf4" strokeWidth="1.8" strokeLinecap="round">
        <line x1="24" y1="22" x2="24" y2="6.5" />
        <line x1="24" y1="22" x2="37.3" y2="14.3" />
        <line x1="24" y1="22" x2="37.3" y2="29.7" />
        <line x1="24" y1="22" x2="24" y2="37.5" />
        <line x1="24" y1="22" x2="10.7" y2="29.7" />
        <line x1="24" y1="22" x2="10.7" y2="14.3" />
      </g>

      {/* Juice cells - tiny dots in each segment */}
      <g fill="#dcfce7" opacity="0.8">
        <circle cx="27" cy="12" r="0.8" />
        <circle cx="29" cy="14" r="0.6" />
        <circle cx="33" cy="19" r="0.7" />
        <circle cx="32" cy="22" r="0.6" />
        <circle cx="33" cy="27" r="0.8" />
        <circle cx="30" cy="30" r="0.6" />
        <circle cx="27" cy="33" r="0.7" />
        <circle cx="24" cy="32" r="0.6" />
        <circle cx="20" cy="33" r="0.8" />
        <circle cx="18" cy="30" r="0.6" />
        <circle cx="15" cy="27" r="0.7" />
        <circle cx="15" cy="22" r="0.6" />
        <circle cx="15" cy="17" r="0.8" />
        <circle cx="18" cy="14" r="0.6" />
        <circle cx="21" cy="12" r="0.7" />
      </g>

      {/* Center pith */}
      <circle cx="24" cy="22" r="2" fill="#f0fdf4" />

      {/* Glossy highlight */}
      <ellipse cx="18" cy="14" rx="6" ry="4" fill="url(#lime-gloss)" />
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
