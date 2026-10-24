// Spotify's mark, used where we connect to Spotify.
export function SpotifyMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="Spotify" className={className}>
      <circle cx="12" cy="12" r="12" fill="#1DB954" />
      <path d="M5.2 8.6c4.3-1.2 9.4-.9 13.3 1.4" stroke="#0a0a0a" strokeWidth="1.9" fill="none" strokeLinecap="round" />
      <path d="M6 12.2c3.6-1 7.7-.7 10.9 1.1" stroke="#0a0a0a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M6.8 15.6c3-.8 6.1-.5 8.7.9" stroke="#0a0a0a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
