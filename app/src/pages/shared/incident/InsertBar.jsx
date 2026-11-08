// What can go into the page: a row of small icons above the keyboard (or the tab bar), and the same list as the "/" menu.
import { useEffect, useState } from 'react';
import { Ambulance, Camera, Hand, ImagePlus, Paperclip, Siren, UserPlus } from 'lucide-react';
import { cx, Pressable, useKeyboardOpen } from '../../../ui/index.jsx';
import { MicButton } from '../../../ui/OrbVoice.jsx';

export const ITEMS = [
  { kind: 'camera', icon: Camera, label: 'Camera', hint: 'Take a photo', words: 'camera photo picture snap' },
  { kind: 'photo', icon: ImagePlus, label: 'Photo', hint: 'From your photos', words: 'photo image picture gallery library' },
  { kind: 'file', icon: Paperclip, label: 'File', hint: 'PDF, Word or text', words: 'file document pdf attach statement' },
  { kind: 'person', icon: UserPlus, label: 'Person', hint: 'Witness or someone involved', words: 'person witness people involved injured staff' },
  { kind: 'police', icon: Siren, label: 'Police', hint: 'Called, with the reference', words: 'police cad crime' },
  { kind: 'ambulance', icon: Ambulance, label: 'Ambulance', hint: 'Called, with the reference', words: 'ambulance paramedic medical' },
  { kind: 'force', icon: Hand, label: 'Force used', hint: 'And why it was necessary', words: 'force restraint physical' },
];
export const slashItems = (q) => (q ? ITEMS.filter((i) => i.label.toLowerCase().startsWith(q) || i.words.includes(q)) : ITEMS);

/** Under the line being written. onMouseDown keeps the text box focused so the cursor stays put */
export function SlashMenu({ items, active, onPick }) {
  return (
    <div role="listbox" aria-label="Insert" className="anim-pop absolute left-0 top-full z-20 mt-1 w-64 max-w-full overflow-hidden rounded-2xl border border-hairline bg-surface py-1 shadow-sheet">
      {items.map((it, i) => (
        <Pressable key={it.kind} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(it)}
          className={cx('flex min-h-11 items-center gap-3 px-3 py-1.5', i === active && 'bg-blue-soft')}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-bg text-ink"><it.icon size={16} aria-hidden /></span>
          <span className="min-w-0"><span className="block text-subhead font-semibold">{it.label}</span><span className="block truncate text-caption text-muted">{it.hint}</span></span>
        </Pressable>
      ))}
    </div>
  );
}

// With the keyboard up the bar rides on top of it; otherwise it sits just above the tab bar
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const on = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    on();
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  return inset;
}

export function InsertBar({ onInsert, onVoice, disabled, active, children }) {
  const keyboard = useKeyboardOpen();
  const inset = useKeyboardInset();
  return (
    <div className="sticky z-30 mt-4 lg:bottom-4" style={{ bottom: keyboard && inset ? inset + 8 : 'calc(var(--tabbar-h) + 8px)' }}>
      <div className="flex items-center gap-1 rounded-full border border-hairline bg-surface/95 p-1 pl-2 shadow-sheet backdrop-blur-xl anim-bar-in">
        <div className="no-scrollbar edge-fade flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" role="toolbar" aria-label="Add to the report">
          {ITEMS.map((it) => (
            <Pressable press key={it.kind} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(it.kind)} aria-label={it.label} title={it.label}
              className={cx('relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-bg disabled:opacity-40',
                active?.includes(it.kind) ? 'text-blue' : 'text-ink')}>
              <it.icon size={20} aria-hidden />
            </Pressable>
          ))}
        </div>
        <span className="mx-0.5 h-6 w-px shrink-0 bg-line" aria-hidden />
        <MicButton onText={onVoice} disabled={disabled} />
        {children}
      </div>
    </div>
  );
}
