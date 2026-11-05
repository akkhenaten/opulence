// Brand photos from /app/brand: castle (the website hero) and the AI-made scenes.
// Night-time, black and gold; children sit on top in light text over a dark gradient.
const cx = (...c) => c.filter(Boolean).join(' ');

export const PHOTOS = ['castle', 'door', 'crowd', 'control', 'street', 'kit'];
const src = (name, w) => `/app/brand/${name}-${w}.webp`;

export function Photo({ name, alt = '', className, imgClassName, priority, shade = true, children }) {
  return (
    <div className={cx('relative isolate overflow-hidden bg-night', className)}>
      <img src={src(name, 1600)} srcSet={`${src(name, 800)} 800w, ${src(name, 1600)} 1600w`} sizes="(min-width: 1024px) 50vw, 100vw"
        alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : undefined}
        className={cx('absolute inset-0 -z-10 h-full w-full object-cover', imgClassName)} />
      {shade && <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />}
      {children}
    </div>
  );
}

