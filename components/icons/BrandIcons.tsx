// Small marks for the services we connect to. Drawn as simple shapes, not copied artwork.
export function TelegramMark({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="Telegram">
      <circle cx="12" cy="12" r="12" fill="#27A7E7" />
      <path d="M5.2 11.8l11.9-4.6c.55-.2 1 .13.83.95l-2 9.4c-.15.67-.55.83-1.1.52l-3.05-2.25-1.47 1.42c-.16.16-.3.3-.62.3l.22-3.1 5.65-5.1c.25-.22-.05-.34-.38-.13l-7 4.4-3-.94c-.65-.2-.66-.65.14-.97z" fill="#fff" />
    </svg>
  );
}

export function GoogleCalendarMark({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="Google Calendar">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#fff" />
      <path d="M3 6a3 3 0 013-3h12a3 3 0 013 3v2H3z" fill="#4285F4" />
      <rect x="3" y="18" width="6" height="3" fill="#34A853" />
      <path d="M15 21h3a3 3 0 003-3v-3h-6z" fill="#EA4335" />
      <path d="M21 8v7h-6V8z" fill="#FBBC04" />
      <path d="M3 8h6v7H3z" fill="#4285F4" opacity=".18" />
      <text x="12" y="16.2" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#1a73e8" fontFamily="system-ui,sans-serif">31</text>
    </svg>
  );
}

export function EmailMark({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="Email">
      <circle cx="12" cy="12" r="12" fill="#6b5b7a" />
      <rect x="5" y="7.5" width="14" height="9.5" rx="1.6" fill="none" stroke="#fff" strokeWidth="1.5" />
      <path d="M5.6 8.6l6.4 4.6 6.4-4.6" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// Green tick badge for "connected", placed over a logo.
export function Tick({ className = "" }: { className?: string }) {
  return (
    <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--background)] bg-[var(--tier-open)] text-[10px] leading-none font-black text-black ${className}`} aria-label="Connected" role="img">
      ✓
    </span>
  );
}

// Google "G" in its four colours, for the sign-in button.
export function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="Google">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
