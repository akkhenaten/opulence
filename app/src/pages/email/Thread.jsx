import { useEffect, useRef, useState } from 'react';
import { Archive, ChevronLeft, Download, Forward, ImageOff, Inbox, MailOpen, Paperclip, Reply, ReplyAll, Sparkles, Star, Trash2 } from 'lucide-react';
import { Avatar, Button, cx, dateTime, ErrorBox, IconButton, Pressable, Spinner, useAction, useApi, useToast } from '../../ui/index.jsx';
import { api } from '../../api.js';
import { ReconnectBanner } from './_settings.jsx';
import { addrFull, addrLabel, MatchChips, sizeLabel, whenLabel } from './_parts.jsx';
import { viewFiles } from '../../ui/FileViewer.jsx';

const lower = (s) => String(s || '').toLowerCase();
const prefixed = (p, s) => (new RegExp(`^${p}:`, 'i').test(s || '') ? s : `${p}: ${s || ''}`.trim());
const snippet = (html) => String(html || '').replace(/<(style|head)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Reply / reply all / forward: who it goes to, the subject, the quoted original and the threading headers. */
export function replyInit(mode, t, m, own) {
  const me = lower(own);
  const notMe = (list) => list.filter((a) => lower(a.email) !== me);
  const mine = lower(m.from?.email) === me;
  if (mode === 'forward') {
    const head = `<p>---------- Forwarded message ----------<br>From: ${esc(addrFull(m.from))}<br>Date: ${esc(dateTime(m.date))}<br>Subject: ${esc(m.subject || t.subject)}<br>To: ${esc(m.to.map(addrFull).join(', '))}</p>`;
    return { mode, subject: prefixed('Fwd', m.subject || t.subject), quote: `${head}${m.html}`, forward: { message_id: m.id, attachments: m.attachments || [] } };
  }
  const to = mine ? m.to : [m.from];
  const all = mode === 'replyAll';
  const seen = new Set(to.map((a) => lower(a.email)));
  const cc = all ? notMe([...(mine ? [] : m.to), ...(m.cc || [])]).filter((a) => !seen.has(lower(a.email)) && seen.add(lower(a.email))) : [];
  return {
    mode, to: notMe(to).length ? notMe(to) : to, cc, subject: prefixed('Re', m.subject || t.subject),
    quote: `<p>On ${esc(dateTime(m.date))}, ${esc(addrFull(m.from))} wrote:</p><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${m.html}</blockquote>`,
    reply: { thread_id: t.id, id: m.id, message_id: m.message_id, references: m.references, all },
  };
}

export default function Thread({ account, id, onClose, onChanged, onCompose }) {
  const q = useApi('email.thread', { account_id: account.id, id });
  const toast = useToast();
  const [run, busy] = useAction();
  const [starred, setStarred] = useState(null);
  const [summary, setSummary] = useState(null);
  const [orb, setOrb] = useState(null); // 'summary' | 'draft' while Orb is thinking
  const t = q.data;

  // Opening it marked it read at the provider: refresh the list and the badge once
  const done = useRef(false);
  useEffect(() => { if (t && !done.current) { done.current = true; onChanged(); } }, [t, onChanged]);

  if (q.loading && !t) return <Spinner className="flex-1" />;
  if (q.error && !t) {
    return (
      <div className="p-4">
        <Back onClose={onClose} />
        {q.error.data?.reconnect ? <ReconnectBanner acc={account} /> : <ErrorBox error={q.error} retry={q.reload} />}
      </div>
    );
  }

  const last = t.messages.at(-1);
  const replyTo = [...t.messages].reverse().find((m) => !m.draft) || last;
  const star = starred ?? t.starred;
  const modify = (ch, msg, close = true) => run(async () => {
    await api('email.modify', { account_id: account.id, id: t.id, ...ch });
    onChanged();
    if (close) onClose();
  }, msg);
  const summarise = async () => {
    setOrb('summary');
    try { setSummary((await api('email.summary', { account_id: account.id, id: t.id })).summary); } catch (e) { toast(e.message, 'error'); } finally { setOrb(null); }
  };
  const draft = async () => {
    setOrb('draft');
    try {
      const r = await api('email.draftReply', { account_id: account.id, id: t.id });
      onCompose({ ...replyInit('reply', t, replyTo, account.address), html: r.html, account_id: account.id, orb: true });
    } catch (e) { toast(e.message, 'error'); } finally { setOrb(null); }
  };
  const reply = (mode) => onCompose({ ...replyInit(mode, t, replyTo, account.address), account_id: account.id });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b border-line px-2 py-2 lg:px-4">
        <Back onClose={onClose} />
        <div className="flex-1" />
        {t.folder === 'archive' || t.folder === 'trash'
          ? <IconButton icon={Inbox} label="Move to inbox" disabled={busy} onClick={() => modify({ inbox: true }, 'Moved to inbox', false)} />
          : <IconButton icon={Archive} label="Archive" disabled={busy} onClick={() => modify({ archive: true }, 'Archived')} />}
        {t.folder !== 'trash' && <IconButton icon={Trash2} label="Delete" disabled={busy} onClick={() => modify({ trash: true }, 'Moved to the bin')} />}
        <IconButton icon={MailOpen} label="Mark unread" disabled={busy} onClick={() => modify({ read: false }, 'Marked unread')} />
        <IconButton icon={Star} label={star ? 'Unstar' : 'Star'} disabled={busy} className={star ? 'text-amber [&_svg]:fill-amber' : ''}
          onClick={() => { setStarred(!star); modify({ starred: !star }, null, false).catch(() => setStarred(star)); }} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pb-2 pt-4 lg:px-6">
          <h2 className="text-title3 font-bold">{t.subject || '(no subject)'}</h2>
          <MatchChips matches={t.matches} max={6} className="mt-2" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="soft" icon={Sparkles} busy={orb === 'summary'} disabled={!!orb} onClick={summarise}>Summarise</Button>
            <Button size="sm" variant="soft" icon={Sparkles} busy={orb === 'draft'} disabled={!!orb} onClick={draft}>Draft a reply</Button>
          </div>
          {summary && (
            <div className="mt-3 rounded-2xl bg-blue-soft p-3 text-subhead">
              <div className="mb-1 flex items-center gap-1.5 text-footnote font-semibold text-blue"><Sparkles size={14} />Orb summary</div>
              <div className="whitespace-pre-line">{summary}</div>
            </div>
          )}
        </div>
        <div className="divide-y divide-line">
          {t.messages.map((m, i) => <Message key={m.id} m={m} account={account} open={i === t.messages.length - 1 || m.unread || t.messages.length <= 2} />)}
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-4 lg:px-6">
          <Button variant="secondary" icon={Reply} onClick={() => reply('reply')}>Reply</Button>
          <Button variant="secondary" icon={ReplyAll} onClick={() => reply('replyAll')}>Reply all</Button>
          <Button variant="secondary" icon={Forward} onClick={() => reply('forward')}>Forward</Button>
        </div>
      </div>
    </div>
  );
}

const Back = ({ onClose }) => <IconButton icon={ChevronLeft} label="Back to the list" onClick={onClose} className="lg:hidden" />;

function Message({ m, account, open: initial }) {
  const [open, setOpen] = useState(initial);
  const [details, setDetails] = useState(false);
  const [images, setImages] = useState(false);
  const remote = /<img[^>]+src=["']?https?:|url\(\s*["']?https?:/i.test(m.html || '');
  return (
    <article className="px-4 py-3 lg:px-6">
      <div className="flex items-start gap-3">
        <Avatar name={addrLabel(m.from)} size={40} />
        <div className="min-w-0 flex-1">
          <Pressable onClick={() => setOpen(!open)} className="block rounded-lg !bg-transparent">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-body font-semibold">{addrLabel(m.from)}{m.draft && <span className="ml-2 text-footnote font-semibold text-red">Draft</span>}</span>
              <span className="shrink-0 text-caption text-faint" title={dateTime(m.date)}>{whenLabel(m.date)}</span>
            </div>
            {!open && <div className="truncate text-footnote text-muted">{snippet(m.html)}</div>}
          </Pressable>
          {open && (
            <Pressable press onClick={() => setDetails(!details)} className="block max-w-full truncate text-footnote text-muted">
              {details ? 'Hide details' : `to ${[...m.to, ...(m.cc || [])].map(addrLabel).join(', ') || 'undisclosed'}`}
            </Pressable>
          )}
          {open && details && (
            <div className="mt-1 space-y-0.5 rounded-xl bg-bg p-2 text-footnote">
              <div><span className="text-faint">From </span>{addrFull(m.from)}</div>
              {m.to.length > 0 && <div><span className="text-faint">To </span>{m.to.map(addrFull).join(', ')}</div>}
              {m.cc?.length > 0 && <div><span className="text-faint">Cc </span>{m.cc.map(addrFull).join(', ')}</div>}
              <div><span className="text-faint">Date </span>{dateTime(m.date)}</div>
            </div>
          )}
        </div>
      </div>
      {open && (
        <>
          {remote && !images && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-bg px-3 py-2 text-footnote text-muted">
              <ImageOff size={16} className="shrink-0" /><span className="flex-1">Pictures from the internet are hidden to protect your privacy.</span>
              <Button size="sm" variant="link" onClick={() => setImages(true)}>Show pictures</Button>
            </div>
          )}
          <MailFrame html={m.html} images={images} />
          {m.attachments?.length > 0 && <Attachments m={m} account={account} />}
        </>
      )}
    </article>
  );
}

// The email itself, in a sandboxed frame: no scripts, no forms, nothing loaded from the internet unless asked
function MailFrame({ html, images }) {
  const ref = useRef(null);
  const [h, setH] = useState(120);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: ${images ? 'https: http:' : ''}`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">
<style>html,body{margin:0;padding:0;background:#fff;color:#1c1c1e;color-scheme:light}body{font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;overflow-wrap:anywhere;padding:2px}
img{max-width:100%;height:auto}table{max-width:100%!important}pre{white-space:pre-wrap}blockquote{margin:0 0 0 .8ex;border-left:2px solid #d1d1d6;padding-left:1ex;color:#555}a{color:#0a66d8}</style></head><body>${html || ''}</body></html>`;
  useEffect(() => {
    const f = ref.current;
    if (!f) return undefined;
    let ro;
    const fit = () => {
      const d = f.contentDocument;
      if (!d?.body) return;
      setH(Math.min(Math.max(d.documentElement.scrollHeight, 40), 20000));
      ro?.disconnect();
      ro = new ResizeObserver(() => setH(Math.min(Math.max(d.documentElement.scrollHeight, 40), 20000)));
      ro.observe(d.body);
    };
    f.addEventListener('load', fit);
    return () => { f.removeEventListener('load', fit); ro?.disconnect(); };
  }, [doc]);
  // allow-same-origin without allow-scripts: we can measure the height, the email still cannot run code
  return <iframe ref={ref} title="Email" srcDoc={doc} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" className="mt-3 w-full rounded-xl border border-line bg-white" style={{ height: h }} />;
}

function Attachments({ m, account }) {
  const [run] = useAction();
  const get = (a) => {
    const list = m.attachments.map((x) => ({ name: x.name, mime: x.mime, load: () => run(() => api('email.attachment', { account_id: account.id, message_id: m.id, id: x.id, name: x.name, mime: x.mime })) }));
    viewFiles(list, m.attachments.indexOf(a));
  };
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {m.attachments.map((a) => (
        <Pressable key={a.id} press onClick={() => get(a)}
          className={cx('inline-flex max-w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-footnote')}>
          <Paperclip size={16} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate font-semibold">{a.name}</span>
          <span className="shrink-0 text-faint">{sizeLabel(a.size)}</span>
          <Download size={16} className="shrink-0 text-blue" />
        </Pressable>
      ))}
    </div>
  );
}
