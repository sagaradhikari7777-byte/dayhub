export function DayMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="4.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.7" fill="currentColor" />
    </svg>
  );
}
export function DayOrbit() {
  return (
    <svg
      className="day-orbit"
      width="90"
      height="90"
      viewBox="0 0 90 90"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="45" cy="45" r="23" stroke="currentColor" strokeWidth=".7" />
      <ellipse
        cx="45"
        cy="45"
        rx="40"
        ry="15"
        transform="rotate(-35 45 45)"
        stroke="currentColor"
        strokeWidth=".7"
      />
      <circle cx="45" cy="45" r="13" fill="currentColor" opacity=".12" />
      <path
        d="M45 36v18M36 45h18M39 39l12 12M39 51l12-12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="73" cy="28" r="3" fill="currentColor" />
    </svg>
  );
}
