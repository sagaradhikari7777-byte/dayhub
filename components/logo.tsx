// The trophy mark, matching public/icon.svg.
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd75e" />
          <stop offset="1" stopColor="#f08c00" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill="url(#logo-bg)" />
      <path
        d="M168 128h176v40h56c0 72-30 112-80 124-14 30-36 48-64 54v46h56v40H200v-40h56v-46c-28-6-50-24-64-54-50-12-80-52-80-124h56zm-24 72c4 34 18 56 34 64-6-18-10-40-10-64zm224 0h-24c0 24-4 46-10 64 16-8 30-30 34-64z"
        fill="#2a1700"
      />
      <rect x="238" y="300" width="36" height="100" fill="#2a1700" />
    </svg>
  );
}
