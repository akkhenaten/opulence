// The Orb mark: a rounded tile with a ring and a dot. Used for the logo fallback and for Orb, the assistant.
export const ORB_BLUE = '#0A6CFF';

export default function OrbMark({ color = ORB_BLUE, className = 'h-8 w-8', tile = true }) {
  return (
    <svg viewBox="0 0 512 512" className={`shrink-0 ${className}`} aria-hidden>
      {tile && <rect width="512" height="512" rx="120" fill={color} />}
      <circle cx="256" cy="256" r="132" fill="none" stroke="#fff" strokeWidth="44" />
      <circle cx="256" cy="256" r="40" fill="#fff" />
    </svg>
  );
}
