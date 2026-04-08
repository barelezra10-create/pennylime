interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  textClassName?: string;
}

/**
 * PennyLime brand mark: a fresh lime slice, perfectly centered for spinning.
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
      </defs>

      {/* Outer rind */}
      <circle cx="24" cy="24" r="22" fill="url(#lime-rind)" />

      {/* Pith ring */}
      <circle cx="24" cy="24" r="19" fill="#f0fdf4" />

      {/* Inner flesh */}
      <circle cx="24" cy="24" r="17.5" fill="url(#lime-flesh)" />

      {/* Segments - 6 dividers from center */}
      <g stroke="#f0fdf4" strokeWidth="1.8" strokeLinecap="round">
        <line x1="24" y1="24" x2="24" y2="6.5" />
        <line x1="24" y1="24" x2="39.2" y2="15.2" />
        <line x1="24" y1="24" x2="39.2" y2="32.8" />
        <line x1="24" y1="24" x2="24" y2="41.5" />
        <line x1="24" y1="24" x2="8.8" y2="32.8" />
        <line x1="24" y1="24" x2="8.8" y2="15.2" />
      </g>

      {/* Center pith */}
      <circle cx="24" cy="24" r="2" fill="#f0fdf4" />
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
