// Orb, the assistant, wears the company's mark: the gold Opulence horse on the dark round tile
export default function OrbBrand({ className = 'h-8 w-8' }) {
  return (
    <span className={`orb-brand grid shrink-0 place-items-center rounded-full ${className}`} aria-hidden>
      <img src="/app/brand/logo-gold-192.png" alt="" className="h-[62%] w-auto" draggable={false} />
    </span>
  );
}
