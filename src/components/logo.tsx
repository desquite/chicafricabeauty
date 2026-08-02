export function Logo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Chic Africa Beauty Online"
    >
      <circle cx="32" cy="32" r="31" fill="#7a3b2e" />
      {/* Fleur stylisée : cinq pétales autour d'un cœur doré */}
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse
          key={angle}
          cx="32"
          cy="19"
          rx="7.5"
          ry="12"
          fill="#f7ebe4"
          opacity="0.92"
          transform={`rotate(${angle} 32 32)`}
        />
      ))}
      <circle cx="32" cy="32" r="6.5" fill="#c89b3c" />
    </svg>
  );
}
