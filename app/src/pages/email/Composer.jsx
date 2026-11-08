import { useEffect, useRef, useState } from 'react';
import { Bold, ChevronDown, Italic, Link2, List, ListOrdered, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { Button, cx, IconButton, Input, inputCls, Pressable, Select, Sheet, useAction, useConfirm, useToast } from '../../ui/index.jsx';
import { api, upload } from '../../api.js';
import { emailChanged, sizeLabel } from './_parts.jsx';

const MAX_BYTES = 20 * 1024 * 1024;
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const asAddr = (a) => (typeof a === 'string' ? { name: '', email: a.trim().toLowerCase() } : { name: a.name || '', email: String(a.email || '').toLowerCase() });
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const sigHtml = (sig) => (sig ? `<p><br></p><div class="orb-signature">-- <br>${esc(sig).replace(/\n/g, '<br>')}</div>` : '');

/**
 * New email, reply, reply all or forward. init: { mode, to, cc, subject, quote, reply, forward, html (an Orb draft), account_id }.
 * Recipients are checked again on the server; the body is cleaned there too.
 */
export default function Composer({ init, account, accounts, onClose, onSent }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [fromId, setFromId] = useState(init.account_id || (account?.status === 'connected' ? account.id : accounts[0]?.id));
  const from = accounts.find((a) => a.id === fromId) || accounts[0];
  const [to, setTo] = useState((init.to || []).map(asAddr));
  const [cc, setCc] = useState((init.cc || []).map(asAddr));
  const [bcc, setBcc] = useState([]);
  const [showCc, setShowCc] = useState(!!init.cc?.length);
  const [subject, setSubject] = useState(init.subject || '');
  const [files, setFiles] = useState([]); // { key?, name, size, uploading }
  const [fwdFiles, setFwdFiles] = useState(init.forward?.attachments || []);
  const [showQuote, setShowQuote] = useState(false);
  const [sending, setSending] = useState(null);
  const editor = useRef(null);
  const dirty = useRef(false);
  const fileInput = useRef(null);

  // Start with the Orb draft (if any) and the signature; the quoted original is added when sending
  useEffect(() => {
    if (!editor.current) return;
    editor.current.innerHTML = `${init.html || '<p><br></p>'}${sigHtml(from?.signature)}`;
    if (!init.to?.length || init.mode === 'forward') return;
    const r = document.createRange();
    r.setStart(editor.current, 0);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    editor.current.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Changing the From mailbox swaps its signature
  const swapFrom = (id) => {
    const next = accounts.find((a) => a.id === id);
    const sig = editor.current?.querySelector('.orb-signature');
    if (sig) sig.outerHTML = next?.signature ? sigHtml(next.signature).replace('<p><br></p>', '') : '';
    else if (next?.signature) editor.current.insertAdjacentHTML('beforeend', sigHtml(next.signature));
    setFromId(id);
  };

  const exec = (cmd, val) => { editor.current?.focus(); document.execCommand(cmd, false, val); dirty.current = true; };
  const link = () => {
    const url = window.prompt('Link address', 'https://');
    if (url && /^(https?:|mailto:)/i.test(url.trim())) exec('createLink', url.trim());
  };

  const total = files.reduce((n, f) => n + (f.size || 0), 0) + fwdFiles.reduce((n, f) => n + (f.size || 0), 0);
  const addFiles = async (list) => {
    for (const file of list) {
      if (total + file.size > MAX_BYTES) { toast('Attachments can be up to 20 MB in total', 'error'); break; }
      const tmp = { id: `${Date.now()}-${file.name}`, name: file.name, size: file.size, uploading: true };
      setFiles((fs) => [...fs, tmp]);
      dirty.current = true;
      try {
        const key = await upload(file, 'email');
        setFiles((fs) => fs.map((f) => (f.id === tmp.id ? { ...f, key, uploading: false } : f)));
      } catch (e) {
        toast(`${file.name}: ${e.message}`, 'error');
        setFiles((fs) => fs.filter((f) => f.id !== tmp.id));
      }
    }
  };

  const close = async () => {
    if ((dirty.current || to.length) && !(await confirm({ title: 'Discard this email?', body: 'What you have written will be lost.', confirm: 'Discard', danger: true }))) return;
    onClose();
  };

  const submit = async (draft) => {
    const body = editor.current?.innerHTML || '';
    if (!draft && !to.length && !cc.length && !bcc.length) return toast('Add someone to send it to', 'error');
    if (!draft && !subject.trim() && !(await confirm({ title: 'Send without a subject?', confirm: 'Send' }))) return undefined;
    if (files.some((f) => f.uploading)) return toast('Wait for the attachments to finish uploading', 'error');
    setSending(draft ? 'draft' : 'send');
    try {
      await run(() => api('email.send', {
        account_id: from.id, to, cc, bcc, subject, draft,
        html: body, quote: init.quote || undefined,
        attachments: files.map(({ key, name }) => ({ key, name })),
        reply: init.reply, forward: init.forward && fwdFiles.length ? { ...init.forward, attachments: fwdFiles } : undefined,
      }), draft ? 'Saved to drafts' : 'Sent');
      emailChanged();
      onSent?.();
      onClose();
    } catch { /* toast already shown */ } finally { setSending(null); }
    return undefined;
  };

  const title = { reply: 'Reply', replyAll: 'Reply all', forward: 'Forward' }[init.mode] || 'New email';
  return (
    <Sheet open onClose={close} title={title} size="lg"
      footer={(
        <>
          <Button variant="secondary" busy={sending === 'draft'} disabled={!!sending} onClick={() => submit(true)}>Save draft</Button>
          <Button icon={Send} busy={sending === 'send'} disabled={!!sending || !from} onClick={() => submit(false)}>Send</Button>
        </>
      )}>
      <div className="space-y-3">
        {init.orb && (
          <div className="flex items-start gap-2 rounded-xl bg-blue-soft px-3 py-2 text-footnote text-blue">
            <Sparkles size={16} className="mt-px shrink-0" />Orb drafted this from the thread and your records. Check it before sending.
          </div>
        )}
        {accounts.length > 1 && !init.reply
          ? <Select label="From" value={from?.id} onChange={(e) => swapFrom(e.target.value)} options={accounts.map((a) => ({ value: a.id, label: a.address }))} />
          : <div className="text-footnote text-muted">From <span className="font-semibold text-ink">{from?.address}</span></div>}
        <div className="flex items-start gap-2">
          <Recipients label="To" value={to} onChange={(v) => { dirty.current = true; setTo(v); }} className="flex-1" />
          {!showCc && <Button variant="link" size="sm" className="mt-8" onClick={() => setShowCc(true)}>Cc/Bcc</Button>}
        </div>
        {showCc && <Recipients label="Cc" value={cc} onChange={setCc} />}
        {showCc && <Recipients label="Bcc" value={bcc} onChange={setBcc} />}
        <Input label="Subject" value={subject} onChange={(e) => { dirty.current = true; setSubject(e.target.value); }} />

        <div className="overflow-hidden rounded-xl border border-line focus-within:border-blue focus-within:ring-4 focus-within:ring-blue/10">
          <div className="flex items-center gap-0.5 border-b border-line bg-bg px-1 py-0.5">
            <IconButton size="sm" icon={Bold} label="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} />
            <IconButton size="sm" icon={Italic} label="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} />
            <IconButton size="sm" icon={List} label="Bulleted list" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')} />
            <IconButton size="sm" icon={ListOrdered} label="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')} />
            <IconButton size="sm" icon={Link2} label="Link" onMouseDown={(e) => e.preventDefault()} onClick={link} />
            <div className="flex-1" />
            <IconButton size="sm" icon={Paperclip} label="Attach files" onClick={() => fileInput.current?.click()} />
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
          </div>
          <div ref={editor} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Message"
            onInput={() => { dirty.current = true; }}
            className="mail-editor min-h-[220px] px-3.5 py-3 text-callout leading-relaxed outline-none [&_a]:text-blue [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:min-h-[1.5em] [&_ul]:list-disc [&_ul]:pl-6" />
        </div>

        {(files.length > 0 || fwdFiles.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {[...fwdFiles.map((f) => ({ ...f, fwd: true })), ...files].map((f) => (
              <span key={f.id} className={cx('inline-flex max-w-full items-center gap-2 rounded-xl border border-line bg-surface py-1 pl-3 pr-1 text-footnote', f.uploading && 'opacity-60')}>
                <Paperclip size={14} className="shrink-0 text-muted" />
                <span className="min-w-0 truncate font-semibold">{f.name}</span>
                <span className="shrink-0 text-faint">{f.uploading ? 'Uploading…' : sizeLabel(f.size)}</span>
                <IconButton size="sm" icon={X} label={`Remove ${f.name}`}
                  onClick={() => (f.fwd ? setFwdFiles((l) => l.filter((x) => x.id !== f.id)) : setFiles((l) => l.filter((x) => x.id !== f.id)))} />
              </span>
            ))}
          </div>
        )}

        {init.quote && (
          <div>
            <Button variant="link" size="sm" iconRight={ChevronDown} onClick={() => setShowQuote(!showQuote)}>
              {showQuote ? 'Hide' : 'Show'} {init.mode === 'forward' ? 'forwarded email' : 'earlier email'}
            </Button>
            {/* Shown as text only: the original is sent as it was, but never rendered as live HTML in the app */}
            {showQuote && <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-line rounded-xl bg-bg p-3 text-footnote text-muted">{quoteText(init.quote)}</div>}
          </div>
        )}
      </div>
    </Sheet>
  );
}

const quoteText = (html) => {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  d.querySelectorAll('p,div,tr,li,blockquote').forEach((b) => b.append('\n'));
  return (d.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
};

/** Address chips with suggestions from staff, officers and clients. Enter, comma or leaving the box adds what was typed. */
function Recipients({ label, value, onChange, className }) {
  const [text, setText] = useState('');
  const [hits, setHits] = useState([]);
  const [active, setActive] = useState(0);
  const toast = useToast();
  useEffect(() => {
    const s = text.trim();
    if (s.length < 2 || s.includes(',')) { setHits([]); return undefined; }
    const t = setTimeout(() => api('email.contacts', { q: s }).then((r) => { setHits(r.filter((h) => !value.some((v) => v.email === h.email))); setActive(0); }).catch(() => setHits([])), 250);
    return () => clearTimeout(t);
  }, [text, value]);

  const add = (list) => {
    const bad = [];
    const next = [...value];
    for (const a of list) {
      const x = asAddr(a);
      if (!EMAIL.test(x.email)) { if (x.email) bad.push(x.email); continue; }
      if (!next.some((v) => v.email === x.email)) next.push(x);
    }
    if (bad.length) toast(`Not an email address: ${bad.join(', ')}`, 'error');
    onChange(next);
    setText(bad.join(', '));
    setHits([]);
  };
  const typed = () => add(text.split(/[,;\s]+/).filter(Boolean));
  const key = (e) => {
    if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); setActive((i) => (i + 1) % hits.length); } else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length); } else if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      if (!text.trim()) return;
      e.preventDefault();
      if (hits[active] && e.key === 'Enter') add([hits[active]]); else typed();
    } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className={cx('relative', className)}>
      <span className="mb-1.5 block text-footnote font-semibold text-muted">{label}</span>
      <div className={cx(inputCls, 'flex h-auto min-h-11 flex-wrap items-center gap-1.5 py-1.5')}>
        {value.map((a) => (
          <span key={a.email} className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-soft py-0.5 pl-2.5 pr-0.5 text-footnote font-semibold text-blue" title={a.email}>
            <span className="truncate">{a.name || a.email}</span>
            <Pressable press aria-label={`Remove ${a.email}`} onClick={() => onChange(value.filter((v) => v.email !== a.email))} className="relative grid h-6 w-6 place-items-center before:absolute before:-inset-2.5 rounded-full hover:bg-blue/10"><X size={14} /></Pressable>
          </span>
        ))}
        {/* ui-ok: a bare field inside the styled chip box */}<input type="text" inputMode="email" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} onBlur={() => setTimeout(() => text.trim() && typed(), 150)}
          aria-label={label} autoComplete="off" className="min-w-[140px] flex-1 bg-transparent py-1 text-callout outline-none" />
      </div>
      {hits.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
          {hits.map((h, i) => (
            <Pressable key={h.email} onMouseDown={(e) => e.preventDefault()} onClick={() => add([h])} className={cx('flex items-center gap-2 px-3 py-2', i === active && '!bg-blue-soft')}>
              <span className="min-w-0 flex-1"><span className="block truncate text-subhead font-semibold">{h.name}</span><span className="block truncate text-footnote text-muted">{h.email}</span></span>
              <span className="shrink-0 text-caption capitalize text-faint">{h.type}</span>
            </Pressable>
          ))}
        </div>
      )}
    </div>
  );
}
