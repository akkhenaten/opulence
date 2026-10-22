import { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, Download } from 'lucide-react';
import { Button, Empty, List, Load, Page, Pressable, SearchInput, Section, cx, useAction, useApi } from '../../ui/index.jsx';
import { InstallSheet } from '../../ui/pwa.jsx';
import { downloadAction } from '../../api.js';

// One paragraph of guide text: "- " lines become bullets, "1. " lines become numbered steps
function Body({ text }) {
  const kind = (l) => (l.startsWith('- ') ? 'ul' : /^\d+\. /.test(l) ? 'ol' : 'p');
  const runs = [];
  for (const para of text.split(/\n\s*\n/)) {
    para.trim().split('\n').forEach((l, j) => {
      const k = kind(l);
      const last = runs[runs.length - 1];
      if (j > 0 && last?.k === k && k !== 'p') last.lines.push(l);
      else runs.push({ k, lines: [l] });
    });
  }
  return runs.map(({ k, lines }, i) => {
    if (k === 'ul') return <ul key={i} className="mb-3 list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>;
    if (k === 'ol') return <ol key={i} className="mb-3 list-decimal space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{l.replace(/^\d+\. /, '')}</li>)}</ol>;
    return <p key={i} className="mb-3">{lines[0]}</p>;
  });
}

function HelpSection({ s, open, onToggle, onInstall }) {
  const [img, setImg] = useState(true);
  return (
    <div id={s.key}>
      <Pressable onClick={onToggle} aria-expanded={open} className="flex items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 text-body font-semibold">{s.title}</span>
        <ChevronDown size={18} className={cx('shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </Pressable>
      {open && (
        <div className="px-4 pb-4 text-subhead leading-relaxed text-ink/90">
          <Body text={s.body} />
          {s.chapter === 'install' && s.id !== 'why' && s.id !== 'updates' && s.id !== 'notifications' && (
            <Button variant="secondary" size="sm" icon={Download} onClick={onInstall} className="mb-3">Install on this device</Button>
          )}
          {s.image && img && (
            <img src={`${import.meta.env.BASE_URL}help/${s.image}`} alt={s.title} loading="lazy" onError={() => setImg(false)}
              className="mt-1 max-h-[560px] w-auto max-w-full rounded-xl border border-line object-contain object-left" />
          )}
        </div>
      )}
    </div>
  );
}

function Guide({ chapters }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});
  const [install, setInstall] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => chapters.map((c) => ({
    ...c,
    sections: c.sections
      .map((s) => ({ ...s, key: `${c.id}-${s.id}`, chapter: c.id }))
      .filter((s) => !needle || `${s.title} ${s.body} ${c.title}`.toLowerCase().includes(needle)),
  })).filter((c) => c.sections.length), [chapters, needle]);

  return (
    <>
      <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guide" className="mb-2 max-w-xl" />
      {!shown.length && <div className="mt-6"><Empty icon={BookOpen} title="No matches" body="Try another word, for example clock, invoice or password." /></div>}
      {shown.map((c) => (
        <Section key={c.id} title={c.title}>
          <List>
            {c.sections.map((s) => (
              <HelpSection key={s.key} s={s} open={!!needle || !!open[s.key]} onToggle={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))} onInstall={() => setInstall(true)} />
            ))}
          </List>
        </Section>
      ))}
      <InstallSheet open={install} onClose={() => setInstall(false)} />
    </>
  );
}

export default function Help() {
  const g = useApi('help.guide');
  const [run, busy] = useAction();
  return (
    <Page title="Help & user guide" subtitle="How to use the app, step by step"
      actions={<Button variant="secondary" icon={Download} busy={busy} onClick={() => run(() => downloadAction('help.pdf'))}>Download as PDF</Button>}>
      <Load q={g} skeleton="rows">{(d) => <Guide chapters={d.chapters} />}</Load>
    </Page>
  );
}
