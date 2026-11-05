import { useState } from 'react';
import { api } from '../../api.js';
import { Avatar, Button, cx, Input, Load, Pressable, Sheet, useApi, useToast } from '../../ui/index.jsx';

/** Send an Everyday post into one of your chats, with an optional note */
export default function ShareSheet({ post, onClose }) {
  const toast = useToast();
  const q = useApi('messages.inbox', {}, { skip: !post });
  const [text, setText] = useState('');
  const [to, setTo] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { setTo(null); setNote(''); setText(''); onClose(); };
  const send = async () => {
    setBusy(true);
    try {
      await api('messages.send', { conversation_id: to.id, body: note.trim(), share: { type: 'post', id: post.id } });
      toast(`Shared to ${to.title}`);
      close();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!post} onClose={close} title="Share to a chat"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button disabled={!to} busy={busy} onClick={send}>Send</Button></>}>
      {post && (
        <Load q={q}>
          {(rows) => {
            const list = rows.filter((c) => ['direct', 'group'].includes(c.kind) && c.title.toLowerCase().includes(text.trim().toLowerCase()));
            return (
              <>
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search chats" />
                <div className="mt-3 max-h-[45vh] space-y-0.5 overflow-y-auto">
                  {list.map((c) => (
                    <Pressable press key={c.id} onClick={() => setTo(c)} className={cx('flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left', to?.id === c.id ? 'bg-blue-soft' : 'hover:bg-bg')}>
                      <Avatar name={c.title} src={c.kind === 'direct' ? [c.others[0]?.photo_thumb_url, c.others[0]?.photo_url] : null} size={36} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-body font-medium">{c.title}</span><span className="block text-caption text-muted">{c.kind === 'group' ? `${c.member_count} people` : 'Direct message'}</span></span>
                    </Pressable>
                  ))}
                  {!list.length && <p className="py-6 text-center text-subhead text-muted">No chats found. Start one in Messages first.</p>}
                </div>
                {to && <Input className="mt-3" label={`Message to ${to.title} (optional)`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say something about it" />}
                <p className="mt-2 text-footnote text-muted">Only staff in the chat can open the post.</p>
              </>
            );
          }}
        </Load>
      )}
    </Sheet>
  );
}
