interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  textClassName?: string;
}

/**
 * PennyLime brand mark: the illustrated half-lime slice (transparent SVG).
 * Image lives at /public/lime-mark.svg.
 */
export function LogoMark({ className = "", size = 32 }: { className?: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/lime-mark.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ display: "inline-block" }}
    />
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
          Penny<span className="text-[#15803d]">Lime<span className="text-[#15803d]">.</span></span>
        </span>
      )}
    </span>
  );
}
